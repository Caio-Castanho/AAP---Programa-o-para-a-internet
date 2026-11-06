'use strict';

/* Camada de persistência local. O navegador mantém este banco em IndexedDB. */
(function () {
  const DATABASE_NAME = 'SCTransportesAAP';
  const DATABASE_VERSION = 1;

  function open() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB não está disponível neste navegador.'));
        return;
      }

      const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains('admins')) {
          const admins = db.createObjectStore('admins', { keyPath: 'id', autoIncrement: true });
          admins.createIndex('email', 'email', { unique: true });
        }

        if (!db.objectStoreNames.contains('clients')) {
          const clients = db.createObjectStore('clients', { keyPath: 'id', autoIncrement: true });
          ['name', 'cpf', 'email', 'phone', 'active'].forEach((name) => clients.createIndex(name, name));
        }

        if (!db.objectStoreNames.contains('students')) {
          const students = db.createObjectStore('students', { keyPath: 'id', autoIncrement: true });
          ['name', 'guardianId', 'school', 'status'].forEach((name) => students.createIndex(name, name));
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('O navegador não abriu o banco local.'));
      request.onblocked = () => reject(new Error('Feche outras abas deste sistema e tente novamente.'));
    });
  }

  function all(db, storeName) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Não foi possível ler os cadastros.'));
    });
  }

  function put(db, storeName, record, isUpdate) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = isUpdate ? store.put(record) : store.add(record);
      request.onsuccess = () => {
        if (!isUpdate) record.id = request.result;
      };
      request.onerror = () => reject(request.error || new Error('Não foi possível salvar o registro.'));
      transaction.oncomplete = () => resolve(record);
      transaction.onerror = () => reject(transaction.error || new Error('Não foi possível salvar o registro.'));
      transaction.onabort = () => reject(transaction.error || new Error('A gravação foi cancelada.'));
    });
  }

  function replaceRecords(db, clients, students) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['clients', 'students'], 'readwrite');
      const clientStore = transaction.objectStore('clients');
      const studentStore = transaction.objectStore('students');
      clientStore.clear();
      studentStore.clear();
      clients.forEach((record) => clientStore.put(record));
      students.forEach((record) => studentStore.put(record));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Falha ao importar o backup.'));
      transaction.onabort = () => reject(transaction.error || new Error('A importação foi cancelada.'));
    });
  }

  window.SCDB = { open, all, put, replaceRecords };
})();
