const API_URL = window.VAN_ESCOLAR_API_URL || 'http://localhost:3333';

const state = {
  token: '',
  refreshToken: '',
  user: null,
  clientes: [],
};

const $ = (selector) => document.querySelector(selector);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function toast(message, kind = 'info') {
  const node = $('#toast');
  node.textContent = message;
  node.dataset.kind = kind;
  node.classList.add('show');
  window.clearTimeout(toast.timeout);
  toast.timeout = window.setTimeout(() => node.classList.remove('show'), 3200);
}

function payload(form) {
  return Object.fromEntries(
    Array.from(new FormData(form).entries()).filter(([, value]) => String(value).trim() !== ''),
  );
}

function fillForm(form, values) {
  Object.entries(values).forEach(([name, value]) => {
    const field = form.elements.namedItem(name);
    if (field && value !== undefined && value !== null) field.value = String(value);
  });
}

function clearSession() {
  state.token = '';
  state.refreshToken = '';
  state.user = null;
  $('#loginPanel').hidden = false;
  $('#cadastroPanel').hidden = true;
  $('#session').hidden = true;
}

async function refreshSession() {
  if (!state.refreshToken) return false;
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ refreshToken: state.refreshToken }),
  });
  if (!response.ok) {
    clearSession();
    return false;
  }
  const result = await response.json();
  state.token = result.token;
  state.refreshToken = result.refreshToken;
  state.user = result.user;
  return true;
}

async function api(path, options = {}, retry = true) {
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set('Content-Type', 'application/json; charset=utf-8');
  if (state.token) headers.set('Authorization', `Bearer ${state.token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (response.status === 401 && retry && state.refreshToken && path !== '/auth/refresh') {
    if (await refreshSession()) return api(path, options, false);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || 'Não foi possível concluir a operação.');
  }
  return response.status === 204 ? null : response.json();
}

async function busy(button, action) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Aguarde...';
  try {
    return await action();
  } catch (error) {
    toast(error.message, 'error');
    return null;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

function empty(container, message) {
  container.replaceChildren(element('div', 'empty', message));
}

function item(title, details, status, active) {
  const wrapper = element('article', 'item');
  const heading = element('div', 'item-title');
  heading.append(element('strong', '', title));
  heading.append(element('span', `badge${active ? '' : ' inactive'}`, status));
  wrapper.append(heading);
  details.forEach((detail) => wrapper.append(element('span', 'item-detail', detail)));
  return wrapper;
}

function updateClienteOptions(selectedId = '') {
  const select = $('#alunoForm select[name="responsavelId"]');
  select.replaceChildren();
  state.clientes.filter((cliente) => cliente.ativo || cliente.id === selectedId).forEach((cliente) => {
    select.add(new Option(`${cliente.nome}${cliente.ativo ? '' : ' · inativo'}`, cliente.id));
  });
  select.disabled = select.options.length === 0;
}

function renderClientes(result) {
  state.clientes = result.data;
  $('#totalClientes').textContent = result.meta.total;
  const list = $('#clientesList');
  list.replaceChildren();
  if (!result.data.length) {
    empty(list, 'Nenhum cliente encontrado.');
    updateClienteOptions();
    return;
  }

  result.data.forEach((cliente) => {
    const row = item(
      cliente.nome,
      [cliente.email || 'Sem e-mail', `Telefone: ${cliente.telefone}`],
      cliente.ativo ? 'ATIVO' : 'INATIVO',
      cliente.ativo,
    );
    const actions = element('div', 'item-actions');
    const edit = element('button', 'small secondary', 'Editar');
    edit.type = 'button';
    edit.addEventListener('click', () => busy(edit, async () => {
      openCliente(await api(`/clientes/${encodeURIComponent(cliente.id)}`));
    }));
    actions.append(edit);

    if (cliente.ativo) {
      const remove = element('button', 'small danger', 'Desativar');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        if (!window.confirm(`Desativar o cliente ${cliente.nome}?`)) return;
        busy(remove, async () => {
          await api(`/clientes/${encodeURIComponent(cliente.id)}`, { method: 'DELETE' });
          toast('Cliente desativado.', 'success');
          await loadAll();
        });
      });
      actions.append(remove);
    }
    row.append(actions);
    list.append(row);
  });
  updateClienteOptions();
}

function renderAlunos(result) {
  $('#totalAlunos').textContent = result.meta.total;
  const list = $('#alunosList');
  list.replaceChildren();
  if (!result.data.length) {
    empty(list, 'Nenhum aluno encontrado.');
    return;
  }

  result.data.forEach((aluno) => {
    const row = item(
      aluno.nome,
      [
        `Responsável: ${aluno.responsavel?.nome || 'não informado'}`,
        `${aluno.turno} · ${aluno.escolaNome || 'Escola não informada'}`,
      ],
      aluno.status,
      aluno.status === 'ATIVO',
    );
    const actions = element('div', 'item-actions');
    const edit = element('button', 'small secondary', 'Editar');
    edit.type = 'button';
    edit.addEventListener('click', () => busy(edit, async () => {
      openAluno(await api(`/alunos/${encodeURIComponent(aluno.id)}`));
    }));
    actions.append(edit);

    if (aluno.status !== 'INATIVO') {
      const remove = element('button', 'small danger', 'Desativar');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        if (!window.confirm(`Desativar o aluno ${aluno.nome}?`)) return;
        busy(remove, async () => {
          await api(`/alunos/${encodeURIComponent(aluno.id)}`, { method: 'DELETE' });
          toast('Aluno desativado.', 'success');
          await loadAll();
        });
      });
      actions.append(remove);
    }
    row.append(actions);
    list.append(row);
  });
}

async function loadClientes(busca = '') {
  const query = new URLSearchParams({ limite: '100' });
  if (busca) query.set('busca', busca);
  renderClientes(await api(`/clientes?${query}`));
}

async function loadAlunos(busca = '') {
  const query = new URLSearchParams({ limite: '100' });
  if (busca) query.set('busca', busca);
  renderAlunos(await api(`/alunos?${query}`));
}

async function loadAll() {
  const [clientes, clientesAtivos, alunos, alunosAtivos] = await Promise.all([
    api('/clientes?limite=100'),
    api('/clientes?ativo=true&limite=1'),
    api('/alunos?limite=100'),
    api('/alunos?status=ATIVO&limite=1'),
  ]);
  renderClientes(clientes);
  renderAlunos(alunos);
  $('#totalClientesAtivos').textContent = clientesAtivos.meta.total;
  $('#totalAlunosAtivos').textContent = alunosAtivos.meta.total;
}

function openCliente(cliente = null) {
  const form = $('#clienteForm');
  form.reset();
  const editing = Boolean(cliente);
  $('#clienteDialogTitle').textContent = editing ? 'Editar cliente' : 'Novo cliente';
  $('#clienteStatusField').hidden = !editing;
  if (editing) fillForm(form, { ...cliente, ativo: String(cliente.ativo) });
  $('#clienteDialog').showModal();
}

function openAluno(aluno = null) {
  if (!state.clientes.some((cliente) => cliente.ativo) && !aluno) {
    toast('Cadastre um cliente ativo antes de incluir um aluno.', 'error');
    return;
  }
  const form = $('#alunoForm');
  form.reset();
  const selectedResponsavel = aluno?.responsavel?.id || aluno?.responsavelId || '';
  updateClienteOptions(selectedResponsavel);
  const editing = Boolean(aluno);
  $('#alunoDialogTitle').textContent = editing ? 'Editar aluno' : 'Novo aluno';
  $('#alunoStatusField').hidden = !editing;
  if (editing) {
    fillForm(form, {
      ...aluno,
      dataNascimento: aluno.dataNascimento?.slice(0, 10),
      responsavelId: selectedResponsavel,
    });
  }
  $('#alunoDialog').showModal();
}

async function checkApi() {
  try {
    const response = await fetch(`${API_URL}/ready`);
    if (!response.ok) throw new Error();
    $('#apiStatus').textContent = 'API e banco de dados disponíveis';
    $('#apiStatus').dataset.status = 'online';
  } catch {
    $('#apiStatus').textContent = 'API indisponível';
    $('#apiStatus').dataset.status = 'offline';
  }
}

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  await busy(button, async () => {
    const result = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    if (result.user.role !== 'ADMIN') {
      state.token = result.token;
      await api('/auth/logout', { method: 'POST' }).catch(() => null);
      clearSession();
      throw new Error('Este módulo é exclusivo para administradores.');
    }
    state.token = result.token;
    state.refreshToken = result.refreshToken;
    state.user = result.user;
    $('#userEmail').textContent = result.user.email;
    $('#loginPanel').hidden = true;
    $('#cadastroPanel').hidden = false;
    $('#session').hidden = false;
    form.elements.senha.value = '';
    await loadAll();
    toast('Acesso realizado.', 'success');
  });
});

$('#logoutButton').addEventListener('click', (event) => busy(event.currentTarget, async () => {
  try {
    await api('/auth/logout', { method: 'POST' });
  } finally {
    clearSession();
    toast('Sessão encerrada.');
  }
}));

$('#refreshButton').addEventListener('click', (event) => busy(event.currentTarget, loadAll));
$('#newClienteButton').addEventListener('click', () => openCliente());
$('#newAlunoButton').addEventListener('click', () => openAluno());

$('#clientesSearchForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  busy(button, () => loadClientes(event.currentTarget.elements.busca.value.trim()));
});

$('#alunosSearchForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  busy(button, () => loadAlunos(event.currentTarget.elements.busca.value.trim()));
});

document.querySelectorAll('[data-close]').forEach((button) => {
  button.addEventListener('click', () => $(`#${button.dataset.close}`).close());
});

$('#clienteForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  await busy(button, async () => {
    const data = payload(form);
    const id = data.id;
    delete data.id;
    if (id) data.ativo = data.ativo === 'true';
    else delete data.ativo;
    await api(id ? `/clientes/${encodeURIComponent(id)}` : '/clientes', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(data),
    });
    $('#clienteDialog').close();
    toast(id ? 'Cliente atualizado.' : 'Cliente cadastrado.', 'success');
    await loadAll();
  });
});

$('#alunoForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  await busy(button, async () => {
    const data = payload(form);
    const id = data.id;
    delete data.id;
    if (data.dataNascimento) data.dataNascimento = `${data.dataNascimento}T12:00:00.000Z`;
    if (!id) delete data.status;
    await api(id ? `/alunos/${encodeURIComponent(id)}` : '/alunos', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(data),
    });
    $('#alunoDialog').close();
    toast(id ? 'Aluno atualizado.' : 'Aluno cadastrado.', 'success');
    await loadAll();
  });
});

clearSession();
checkApi();
