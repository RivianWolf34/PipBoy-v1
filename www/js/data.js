/* =====================================================
   DATA.JS — GESTOR DE MISIONES Y RECORDATORIOS OFFLINE
===================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 0. RELOJ INFERIOR Y TELEMETRÍA DE SISTEMA
    // ==========================================
    const displayHoraData = document.getElementById('data-hora-display');
    const contadorStats = document.getElementById('data-stats-count');

    function actualizarRelojData() {
        if (!displayHoraData) return;
        const ahora = new Date();
        const horas = String(ahora.getHours()).padStart(2, '0');
        const minutos = String(ahora.getMinutes()).padStart(2, '0');
        const segundos = String(ahora.getSeconds()).padStart(2, '0');
        displayHoraData.textContent = `${horas}:${minutos}:${segundos}`;
    }
    setInterval(actualizarRelojData, 1000);
    actualizarRelojData();


    // ==========================================
    // 1. GESTOR DE MISIONES (QUEST LOG)
    // ==========================================
    const inputTarea = document.getElementById('input-tarea');
    const btnAgregarMision = document.getElementById('btn-agregar-mision');
    const listaTareas = document.getElementById('lista-tareas');
    const STORAGE_KEY = 'pipboy_quests_v1';
    const STORAGE_RECS_KEY = 'pipboy_reminders_v1';

    let misiones = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    let recordatorios = JSON.parse(localStorage.getItem(STORAGE_RECS_KEY)) || [];

    function actualizarContadorTelemetria() {
        if (!contadorStats) return;
        const totalActivas = misiones.filter(m => !m.completada).length;
        const totalRecs = recordatorios.length;
        contadorStats.textContent = `${totalActivas} QUESTS // ${totalRecs} ALERTS`;
    }

    function guardarMisiones() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(misiones));
        actualizarContadorTelemetria();
    }

    function renderizarMisiones() {
        if (!listaTareas) return;
        listaTareas.innerHTML = '';

        if (misiones.length === 0) {
            const vacio = document.createElement('li');
            vacio.className = 'quest-vacia';
            vacio.textContent = '[ NO HAY MISIONES ACTIVAS EN EL REGISTRO ]';
            listaTareas.appendChild(vacio);
            actualizarContadorTelemetria();
            return;
        }

        misiones.forEach((mision, index) => {
            const li = document.createElement('li');
            li.className = `quest-item ${mision.completada ? 'completada' : ''}`;
            li.dataset.index = index; 

            const textoSpan = document.createElement('span');
            textoSpan.className = 'quest-texto';
            textoSpan.innerHTML = `<span class="check">${mision.completada ? '[■]' : '[□]'}</span> ${mision.texto}`;
            
            const btnEliminar = document.createElement('button');
            btnEliminar.className = 'quest-eliminar eliminar';
            btnEliminar.textContent = '[X]';

            li.appendChild(textoSpan);
            li.appendChild(btnEliminar);
            listaTareas.appendChild(li);
        });

        actualizarContadorTelemetria();
    }

    function agregarNuevaMision() {
        if (!inputTarea || inputTarea.value.trim() === '') return;

        misiones.push({
            texto: inputTarea.value.trim().toUpperCase(),
            completada: false
        });
        
        inputTarea.value = '';
        guardarMisiones();
        renderizarMisiones();
    }

    if (inputTarea) {
        inputTarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                agregarNuevaMision();
            }
        });
    }

    if (btnAgregarMision) {
        btnAgregarMision.addEventListener('click', agregarNuevaMision);
    }

    if (listaTareas) {
        listaTareas.addEventListener('click', (e) => {
            const li = e.target.closest('li.quest-item');
            if (!li) return;

            e.stopPropagation(); 

            const index = li.dataset.index;
            const esEliminar = e.target.closest('.quest-eliminar') || e.target.textContent.trim().toUpperCase() === '[X]';

            if (esEliminar) {
                if (window.reproducirSonido) window.reproducirSonido('ui_menu_cancel.wav');
                misiones.splice(index, 1);
            } else {
                if (window.reproducirSonido) window.reproducirSonido('ui_menu_ok.wav');
                misiones[index].completada = !misiones[index].completada;
            }

            guardarMisiones();
            renderizarMisiones();
        });
    }

    renderizarMisiones();


    // ==========================================
    // 2. SISTEMA DE RECORDATORIOS TÁCTICOS
    // ==========================================
    const inputRecFecha = document.getElementById('input-rec-fecha');
    const inputRecTexto = document.getElementById('input-rec-texto');
    const btnAddRec = document.getElementById('btn-add-rec');
    const listaRecs = document.getElementById('lista-recordatorios');

    function guardarRecordatorios() {
        localStorage.setItem(STORAGE_RECS_KEY, JSON.stringify(recordatorios));
        actualizarContadorTelemetria();
    }

    function calcularTiempoRestante(fechaObjetivo) {
        const ahora = new Date().getTime();
        const objetivo = new Date(fechaObjetivo).getTime();
        const diferencia = objetivo - ahora;

        if (diferencia < 0) {
            return { estado: 'vencido', texto: '[ EXPIRADO ]' };
        }

        const horas = Math.floor(diferencia / (1000 * 60 * 60));
        const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));

        if (horas >= 2) {
            return { estado: 'normal', texto: `[ ${horas}H ${minutos}M ]` };
        } else {
            return { estado: 'urgente', texto: `[! 0${horas}H ${minutos}M !]` };
        }
    }

    function renderizarRecordatorios() {
        if (!listaRecs) return;
        listaRecs.innerHTML = '';

        if (recordatorios.length === 0) {
            listaRecs.innerHTML = '<li class="quest-vacia">[ SIN RECORDATORIOS ACTIVOS ]</li>';
            actualizarContadorTelemetria();
            return;
        }

        recordatorios.forEach((rec, index) => {
            const li = document.createElement('li');
            const tiempoInfo = calcularTiempoRestante(rec.fecha);

            li.className = `quest-item rec-${tiempoInfo.estado}`;

            const textoSpan = document.createElement('span');
            textoSpan.className = 'quest-texto';
            textoSpan.textContent = `${tiempoInfo.texto} — ${rec.texto}`;

            const btnEliminar = document.createElement('button');
            btnEliminar.className = 'quest-eliminar eliminar';
            btnEliminar.textContent = '[X]';
            
            btnEliminar.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.reproducirSonido) window.reproducirSonido('ui_menu_cancel.wav');
                recordatorios.splice(index, 1);
                guardarRecordatorios();
                renderizarRecordatorios();
            });

            li.appendChild(textoSpan);
            li.appendChild(btnEliminar);
            listaRecs.appendChild(li);
        });

        actualizarContadorTelemetria();
    }

    function agregarRecordatorio() {
        if (!inputRecFecha.value || !inputRecTexto.value.trim()) return;

        recordatorios.push({
            fecha: inputRecFecha.value,
            texto: inputRecTexto.value.trim().toUpperCase()
        });

        inputRecTexto.value = '';
        inputRecFecha.value = '';
        guardarRecordatorios();
        renderizarRecordatorios();
    }

    if (btnAddRec) {
        btnAddRec.addEventListener('click', agregarRecordatorio);
    }

    if (inputRecTexto) {
        inputRecTexto.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                agregarRecordatorio();
            }
        });
    }

    // ==========================================
    // DISPARO Y ACTUALIZACIÓN DE RECORDATORIOS
    // ==========================================
    // Actualiza cada minuto si tienes la pantalla encendida
    setInterval(renderizarRecordatorios, 60000);
    
    // Al despertar el celular, refresca inmediatamente los tiempos de la lista
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            renderizarRecordatorios();
        }
    });
});