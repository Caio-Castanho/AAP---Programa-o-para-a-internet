
    'use strict';
    const PASSWORD_ITERATIONS = 180000;
    const SHIFTS = ['MANHA', 'TARDE', 'INTEGRAL'];
    const STUDENT_STATUSES = ['ATIVO', 'SUSPENSO', 'INATIVO'];
    const state = { db: null, admin: null, clients: [], students: [], clientQuery: '', studentQuery: '' };
    const $ = (selector, root = document) => root.querySelector(selector);

    function el(tag, className = '', text = '') {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== '') node.textContent = text;
      return node;
    }
    function notify(message, kind = '') {
      const node = $('#toast');
      node.textContent = message;
      node.className = `toast show ${kind}`.trim();
      clearTimeout(notify.timer);
      notify.timer = setTimeout(() => { node.className = 'toast'; }, 3300);
    }
    function setScreen(screenId) {
      ['storageError', 'setupPanel', 'loginPanel', 'appPanel'].forEach((id) => $(`#${id}`).classList.add('hidden'));
      $(`#${screenId}`).classList.remove('hidden');
    }
    function openDatabase() { return window.SCDB.open(); }
    function getAll(storeName) { return window.SCDB.all(state.db, storeName); }
    function putRecord(storeName, record, isUpdate) { return window.SCDB.put(state.db, storeName, record, isUpdate); }
    function importRecords(clients, students) { return window.SCDB.replaceRecords(state.db, clients, students); }
    function currentTime() { return new Date().toISOString(); }
    function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
    function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
    function toHex(buffer) { return Array.from(new Uint8Array(buffer), (part) => part.toString(16).padStart(2, '0')).join(''); }
    function newSalt() { const bytes = new Uint8Array(16); window.crypto.getRandomValues(bytes); return bytes; }
    function bytesToText64(bytes) { return btoa(String.fromCharCode(...bytes)); }
    function text64ToBytes(text) { return Uint8Array.from(atob(text), (char) => char.charCodeAt(0)); }
    async function derivePassword(password, salt) {
      if (!window.crypto?.subtle) throw new Error('A criptografia deste navegador não está disponível. Atualize o Edge ou Chrome.');
      const key = await window.crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      return window.crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, key, 256);
    }
    async function start() {
      try {
        state.db = await openDatabase();
        const admins = await getAll('admins');
        setScreen(admins.length ? 'loginPanel' : 'setupPanel');
      } catch (error) {
        setScreen('storageError');
        $('#storageErrorText').textContent = error.message;
      }
    }
    async function createAdmin(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const email = normalizeEmail(form.elements.email.value);
      const password = form.elements.password.value;
      if (!validEmail(email)) return notify('Informe um e-mail válido.', 'error');
      if (password.length < 12) return notify('A senha deve ter pelo menos 12 caracteres.', 'error');
      if (password !== form.elements.confirmation.value) return notify('As senhas não correspondem.', 'error');
      try {
        if ((await getAll('admins')).length) { setScreen('loginPanel'); return notify('A conta já foi criada neste navegador.'); }
        const salt = newSalt();
        const hash = toHex(await derivePassword(password, salt));
        await putRecord('admins', { email, salt: bytesToText64(salt), passwordHash: hash, createdAt: currentTime() }, false);
        form.reset();
        setScreen('loginPanel');
        notify('Administrador criado. Entre com a conta cadastrada.', 'success');
      } catch (error) { notify(error.message, 'error'); }
    }
    async function login(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const email = normalizeEmail(form.elements.email.value);
      const password = form.elements.password.value;
      try {
        const admin = (await getAll('admins')).find((item) => item.email === email);
        if (!admin) return notify('E-mail ou senha inválidos.', 'error');
        const hash = toHex(await derivePassword(password, text64ToBytes(admin.salt)));
        if (hash !== admin.passwordHash) return notify('E-mail ou senha inválidos.', 'error');
        state.admin = admin;
        form.reset();
        $('#userEmail').textContent = admin.email;
        $('#headerActions').classList.remove('hidden');
        setScreen('appPanel');
        await refreshData();
        notify('Acesso realizado.', 'success');
      } catch (error) { notify(error.message, 'error'); }
    }
    function logout() {
      state.admin = null;
      state.clients = [];
      state.students = [];
      $('#headerActions').classList.add('hidden');
      $('#userEmail').textContent = '';
      setScreen('loginPanel');
      notify('Sessão encerrada.');
    }
    async function refreshData() {
      const [clients, students] = await Promise.all([getAll('clients'), getAll('students')]);
      state.clients = clients;
      state.students = students;
      renderDashboard();
    }
    function renderDashboard() {
      $('#totalClients').textContent = String(state.clients.length);
      $('#activeClients').textContent = String(state.clients.filter((item) => item.active).length);
      $('#totalStudents').textContent = String(state.students.length);
      $('#activeStudents').textContent = String(state.students.filter((item) => item.status === 'ATIVO').length);
      renderClients();
      renderStudents();
    }
    function sortedClients() {
      return [...state.clients].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR'));
    }
    function sortedStudents() {
      const order = { ATIVO: 0, SUSPENSO: 1, INATIVO: 2 };
      return [...state.students].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name, 'pt-BR'));
    }
    function statusBadge(title, status, className) {
      const head = el('div', 'record-top');
      head.append(el('h3', '', title), el('span', `badge ${className}`, status));
      return head;
    }
    function makeButton(text, className, handler) {
      const button = el('button', `button ${className} small`, text);
      button.type = 'button';
      button.addEventListener('click', handler);
      return button;
    }
    function renderClients() {
      const list = $('#clientsList');
      list.replaceChildren();
      const query = state.clientQuery.toLocaleLowerCase('pt-BR');
      const items = sortedClients().filter((client) => !query || [client.name, client.cpf, client.email, client.phone].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(query))).slice(0, 100);
      if (!items.length) { list.append(el('div', 'empty', 'Nenhum cliente encontrado.')); return; }
      items.forEach((client) => {
        const row = el('article', 'record');
        row.append(statusBadge(client.name, client.active ? 'Ativo' : 'Inativo', client.active ? 'badge-active' : 'badge-inactive'));
        const details = el('div', 'record-details');
        details.append(el('span', '', `Telefone: ${client.phone}`));
        if (client.cpf) details.append(el('span', '', `CPF: ${client.cpf}`));
        details.append(el('span', '', client.email || 'Sem e-mail informado'));
        row.append(details);
        const actions = el('div', 'record-actions');
        actions.append(makeButton('Editar', 'light', () => openClient(client)));
        if (client.active) actions.append(makeButton('Desativar', 'danger', () => deactivateClient(client)));
        row.append(actions);
        list.append(row);
      });
    }
    function findGuardian(student) { return state.clients.find((client) => client.id === student.guardianId); }
    function renderStudents() {
      const list = $('#studentsList');
      list.replaceChildren();
      const query = state.studentQuery.toLocaleLowerCase('pt-BR');
      const items = sortedStudents().filter((student) => {
        const guardian = findGuardian(student);
        return !query || [student.name, student.school, guardian?.name].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(query));
      }).slice(0, 100);
      if (!items.length) { list.append(el('div', 'empty', 'Nenhum aluno encontrado.')); return; }
      items.forEach((student) => {
        const row = el('article', 'record');
        const statusText = ({ ATIVO: 'Ativo', SUSPENSO: 'Suspenso', INATIVO: 'Inativo' })[student.status] || 'Inativo';
        const statusClass = student.status === 'ATIVO' ? 'badge-active' : student.status === 'SUSPENSO' ? 'badge-suspended' : 'badge-inactive';
        row.append(statusBadge(student.name, statusText, statusClass));
        const guardian = findGuardian(student);
        const details = el('div', 'record-details');
        details.append(el('span', '', `Responsável: ${guardian?.name || 'Não encontrado'}${guardian && !guardian.active ? ' (inativo)' : ''}`));
        details.append(el('span', '', `${({ MANHA: 'Manhã', TARDE: 'Tarde', INTEGRAL: 'Integral' })[student.shift] || student.shift} · ${student.school || 'Escola não informada'}`));
        details.append(el('span', '', `Embarque: ${student.pickupAddress}`));
        row.append(details);
        const actions = el('div', 'record-actions');
        actions.append(makeButton('Editar', 'light', () => openStudent(student)));
        if (student.status !== 'INATIVO') actions.append(makeButton('Desativar', 'danger', () => deactivateStudent(student)));
        row.append(actions);
        list.append(row);
      });
    }
    function openClient(client = null) {
      const form = $('#clientForm');
      form.reset();
      const editing = Boolean(client);
      $('#clientDialogTitle').textContent = editing ? 'Editar cliente' : 'Novo cliente';
      form.elements.id.value = client?.id || '';
      form.elements.name.value = client?.name || '';
      form.elements.phone.value = client?.phone || '';
      form.elements.cpf.value = client?.cpf || '';
      form.elements.email.value = client?.email || '';
      form.elements.active.value = client?.active ? 'true' : 'false';
      $('#clientStatusField').classList.toggle('hidden', !editing);
      $('#clientDialog').showModal();
    }
    function fillGuardians(selectedId = '') {
      const select = $('#studentForm').elements.guardianId;
      select.replaceChildren(new Option('Selecione um responsável', ''));
      const options = state.clients.filter((client) => client.active || String(client.id) === String(selectedId))
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR'));
      options.forEach((client) => select.add(new Option(`${client.name}${client.active ? '' : ' · inativo'}`, String(client.id))));
      select.value = String(selectedId || '');
      return state.clients.some((client) => client.active);
    }
    function openStudent(student = null) {
      if (!student && !state.clients.some((client) => client.active)) return notify('Cadastre um cliente ativo antes de incluir um aluno.', 'error');
      const form = $('#studentForm');
      form.reset();
      const editing = Boolean(student);
      $('#studentDialogTitle').textContent = editing ? 'Editar aluno' : 'Novo aluno';
      form.elements.id.value = student?.id || '';
      form.elements.name.value = student?.name || '';
      form.elements.birthDate.value = student?.birthDate || '';
      form.elements.cpf.value = student?.cpf || '';
      form.elements.shift.value = student?.shift || 'MANHA';
      form.elements.school.value = student?.school || '';
      form.elements.pickupAddress.value = student?.pickupAddress || '';
      form.elements.status.value = student?.status || 'ATIVO';
      $('#studentStatusField').classList.toggle('hidden', !editing);
      $('#studentStatusHelp').classList.toggle('hidden', editing);
      fillGuardians(student?.guardianId || '');
      $('#studentDialog').showModal();
    }
    async function saveClient(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const id = Number(form.elements.id.value) || null;
      const old = id ? state.clients.find((item) => item.id === id) : null;
      const record = {
        name: form.elements.name.value.trim(), phone: form.elements.phone.value.trim(),
        cpf: form.elements.cpf.value.trim(), email: form.elements.email.value.trim(),
        active: id ? form.elements.active.value === 'true' : true,
        createdAt: old?.createdAt || currentTime(), updatedAt: currentTime(),
      };
      if (id) record.id = id;
      try {
        await putRecord('clients', record, Boolean(id));
        $('#clientDialog').close(); await refreshData();
        notify(id ? 'Cliente atualizado.' : 'Cliente cadastrado.', 'success');
      } catch (error) { notify(error.message, 'error'); }
    }
    async function saveStudent(event) {
      event.preventDefault();
      const form = event.currentTarget;
      const id = Number(form.elements.id.value) || null;
      const old = id ? state.students.find((item) => item.id === id) : null;
      const guardianId = Number(form.elements.guardianId.value);
      const guardian = state.clients.find((client) => client.id === guardianId);
      if (!guardian || (!guardian.active && (!old || old.guardianId !== guardianId))) return notify('Selecione um cliente responsável ativo.', 'error');
      const record = {
        name: form.elements.name.value.trim(), birthDate: form.elements.birthDate.value,
        cpf: form.elements.cpf.value.trim(), shift: form.elements.shift.value,
        school: form.elements.school.value.trim(), pickupAddress: form.elements.pickupAddress.value.trim(),
        status: id ? form.elements.status.value : 'ATIVO', guardianId,
        createdAt: old?.createdAt || currentTime(), updatedAt: currentTime(),
      };
      if (!SHIFTS.includes(record.shift) || !STUDENT_STATUSES.includes(record.status)) return notify('Confira o turno e a situação do aluno.', 'error');
      if (id) record.id = id;
      try {
        await putRecord('students', record, Boolean(id));
        $('#studentDialog').close(); await refreshData();
        notify(id ? 'Aluno atualizado.' : 'Aluno cadastrado.', 'success');
      } catch (error) { notify(error.message, 'error'); }
    }
    async function deactivateClient(client) {
      if (!window.confirm(`Desativar o cliente ${client.name}?`)) return;
      try {
        await putRecord('clients', { ...client, active: false, updatedAt: currentTime() }, true);
        await refreshData(); notify('Cliente desativado.', 'success');
      } catch (error) { notify(error.message, 'error'); }
    }
    async function deactivateStudent(student) {
      if (!window.confirm(`Desativar o aluno ${student.name}?`)) return;
      try {
        await putRecord('students', { ...student, status: 'INATIVO', updatedAt: currentTime() }, true);
        await refreshData(); notify('Aluno desativado.', 'success');
      } catch (error) { notify(error.message, 'error'); }
    }
    async function exportBackup() {
      try {
        const [clients, students] = await Promise.all([getAll('clients'), getAll('students')]);
        const data = { application: 'SC Transportes', version: 1, exportedAt: currentTime(), clients, students };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl; link.download = `backup-sc-transportes-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(objectUrl);
        notify('Backup exportado. Guarde o arquivo em local protegido.', 'success');
      } catch (error) { notify(error.message, 'error'); }
    }
    function validBackup(data) {
      if (!data || data.application !== 'SC Transportes' || data.version !== 1 || !Array.isArray(data.clients) || !Array.isArray(data.students)) return false;
      const clientIds = new Set();
      for (const client of data.clients) {
        if (!Number.isInteger(client.id) || client.id < 1 || clientIds.has(client.id) || typeof client.name !== 'string' || typeof client.phone !== 'string' || typeof client.active !== 'boolean') return false;
        clientIds.add(client.id);
      }
      const studentIds = new Set();
      for (const student of data.students) {
        if (!Number.isInteger(student.id) || student.id < 1 || studentIds.has(student.id) || typeof student.name !== 'string' || !SHIFTS.includes(student.shift) || !STUDENT_STATUSES.includes(student.status) || !clientIds.has(student.guardianId) || typeof student.pickupAddress !== 'string') return false;
        studentIds.add(student.id);
      }
      return true;
    }
    async function importBackup(file) {
      try {
        const data = JSON.parse(await file.text());
        if (!validBackup(data)) throw new Error('O arquivo não é um backup compatível deste programa.');
        if (!window.confirm(`O backup substituirá os ${state.clients.length} clientes e ${state.students.length} alunos deste navegador. A conta administrativa será mantida. Deseja continuar?`)) return;
        await importRecords(data.clients, data.students);
        await refreshData();
        notify('Backup importado.', 'success');
      } catch (error) { notify(error.message || 'Não foi possível importar o backup.', 'error'); }
      finally { $('#backupFile').value = ''; }
    }
    function bindEvents() {
      $('#setupForm').addEventListener('submit', createAdmin);
      $('#loginForm').addEventListener('submit', login);
      $('#logoutButton').addEventListener('click', logout);
      $('#refreshButton').addEventListener('click', async () => { await refreshData(); notify('Dados atualizados.', 'success'); });
      $('#exportButton').addEventListener('click', exportBackup);
      $('#importButton').addEventListener('click', () => $('#backupFile').click());
      $('#backupFile').addEventListener('change', (event) => { const file = event.currentTarget.files?.[0]; if (file) importBackup(file); });
      $('#newClientButton').addEventListener('click', () => openClient());
      $('#newStudentButton').addEventListener('click', () => openStudent());
      $('#clientForm').addEventListener('submit', saveClient);
      $('#studentForm').addEventListener('submit', saveStudent);
      $('#clientSearchForm').addEventListener('submit', (event) => { event.preventDefault(); state.clientQuery = event.currentTarget.elements.query.value.trim(); renderClients(); });
      $('#studentSearchForm').addEventListener('submit', (event) => { event.preventDefault(); state.studentQuery = event.currentTarget.elements.query.value.trim(); renderStudents(); });
      document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => $(`#${button.dataset.close}`).close()));
      document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));
    }
    bindEvents();
    start();
  