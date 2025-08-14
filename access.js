// access.js
// Página de acceso: elige rol (profesora o alumna)
const accessApp = document.getElementById('access-app');

function getRoleFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('role');
}

function renderAccessPage() {
    accessApp.innerHTML = `
        <h2>Bienvenida al Evaluador JS</h2>
        <p>Selecciona tu rol para continuar:</p>
        <div style="display:flex; gap:24px; margin:32px 0;">
            <button id="teacher-btn">Acceso Profesora</button>
            <button id="student-btn">Acceso Alumna</button>
        </div>
    `;
    document.getElementById('teacher-btn').onclick = () => {
        const code = prompt('Ingrese el código de acceso para profesoras:');
        // Cambia este código por el que desees
        const ACCESS_CODE = 'ada2025';
        if (code === ACCESS_CODE) {
            window.location.href = 'access.html?role=teacher&auth=ok';
        } else if (code !== null) {
            alert('Código incorrecto.');
        }
    };
    document.getElementById('student-btn').onclick = () => {
        window.location.href = 'index.html?role=student';
    };
}

async function showQuestionUploadPanelIfTeacher() {
    const params = new URLSearchParams(window.location.search);
    const role = params.get('role');
    const auth = params.get('auth');
    const panel = document.getElementById('question-upload');
    if (role === 'teacher' && auth === 'ok' && panel) {
        // Mostrar lista de cuestionarios existentes
        let html = '<h3>Selecciona un cuestionario existente</h3>';
        let quizListDiv = document.getElementById('quiz-list');
        if (!quizListDiv) {
            quizListDiv = document.createElement('div');
            quizListDiv.id = 'quiz-list';
            quizListDiv.style.marginBottom = '24px';
            panel.parentNode.insertBefore(quizListDiv, panel);
        }
        // Leer cuestionarios de Firestore
        const quizzesSnap = await db.collection('quizzes').get();
        const quizzes = quizzesSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        if (quizzes.length === 0) {
            quizListDiv.innerHTML = '<p>No hay cuestionarios guardados aún.</p>';
        } else {
            quizListDiv.innerHTML = '<ul style="list-style:disc inside;">' + quizzes.map(q =>
                `<li><b>${q.name || q.id}</b> <button data-id="${q.id}" class="select-quiz-btn">Seleccionar</button></li>`
            ).join('') + '</ul>';
            quizListDiv.innerHTML += '<div id="quiz-action"></div>';
        }
        let selectedQuizId = localStorage.getItem('selectedQuiz') || '';
        // Manejar selección
        quizListDiv.onclick = (e) => {
            if (e.target.classList.contains('select-quiz-btn')) {
                const quizId = e.target.getAttribute('data-id');
                selectedQuizId = quizId;
                localStorage.setItem('selectedQuiz', quizId);
                document.getElementById('quiz-action').innerHTML = `<button id='use-quiz-btn'>Usar este cuestionario</button>`;
                document.getElementById('use-quiz-btn').onclick = async () => {
                    // Guardar selección en Firestore (sala principal)
                    await db.collection('rooms').doc('sala1').set({quizId: quizId, quizStarted: false, currentQuestion: 0}, {merge: true});
                    alert('Cuestionario activado. Ahora las alumnas pueden ingresar y comenzar la evaluación.');
                    // Redirigir a la vista de seguimiento de profesora
                    window.location.href = 'index.html?role=teacher';
                };
            }
        };
        // Si ya hay uno seleccionado, mostrar botón para usarlo
        if (selectedQuizId && document.getElementById('quiz-action')) {
            document.getElementById('quiz-action').innerHTML = `<button id='use-quiz-btn'>Usar este cuestionario</button>`;
            document.getElementById('use-quiz-btn').onclick = async () => {
                await db.collection('rooms').doc('sala1').set({quizId: selectedQuizId, quizStarted: false, currentQuestion: 0}, {merge: true});
                alert('Cuestionario activado. Ahora las alumnas pueden ingresar y comenzar la evaluación.');
                // Redirigir a la vista de seguimiento de profesora
                window.location.href = 'index.html?role=teacher';
            };
        }
        panel.style.display = 'block';

        // Lógica para cargar cuestionario
        const fileInput = document.getElementById('questions-file');
        const textArea = document.getElementById('questions-text');
        const loadBtn = document.getElementById('load-questions-btn');
        const feedback = document.getElementById('questions-feedback');

        loadBtn.onclick = async () => {
            feedback.textContent = '';
            let quizObj = null;
            // Si hay archivo cargado
            if (fileInput.files && fileInput.files[0]) {
                try {
                    const file = fileInput.files[0];
                    const text = await file.text();
                    quizObj = JSON.parse(text);
                } catch (e) {
                    feedback.textContent = 'Error al leer el archivo JSON.';
                    return;
                }
            } else if (textArea.value.trim()) {
                // Parsear el área de texto
                try {
                    quizObj = parseQuestionsText(textArea.value.trim());
                } catch (e) {
                    feedback.textContent = 'Error en el formato del área de texto: ' + e.message;
                    return;
                }
            } else {
                feedback.textContent = 'Debes subir un archivo o pegar preguntas.';
                return;
            }
            // Pedir nombre del cuestionario
            let quizName = quizObj.name || prompt('Nombre para el cuestionario:', 'Cuestionario personalizado');
            if (!quizName) {
                feedback.textContent = 'Debes ingresar un nombre.';
                return;
            }
            // Guardar en Firestore
            try {
                await db.collection('quizzes').doc(quizName).set({
                    name: quizName,
                    questions: quizObj.questions
                });
                feedback.style.color = 'green';
                feedback.textContent = '¡Cuestionario guardado correctamente!';
                fileInput.value = '';
                textArea.value = '';
                // Refrescar lista
                showQuestionUploadPanelIfTeacher();
            } catch (e) {
                feedback.textContent = 'Error al guardar en Firestore: ' + e.message;
            }
        };

        // Función para parsear el área de texto
        function parseQuestionsText(text) {
            const blocks = text.split(/\n-{3,}\n?/).map(b => b.trim()).filter(Boolean);
            const questions = blocks.map(block => {
                const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
                const q = {options: []};
                for (let line of lines) {
                    if (line.startsWith('Pregunta:')) {
                        q.question = line.replace('Pregunta:', '').trim();
                    } else if (/^\*?[A-D]\)/.test(line)) {
                        let correct = line.startsWith('*');
                        let optText = line.replace(/^\*?([A-D]\))/, '').trim();
                        q.options.push(optText);
                        if (correct) q.answer = q.options.length - 1;
                    } else if (line.startsWith('Justificación:')) {
                        q.justification = line.replace('Justificación:', '').trim();
                    }
                }
                if (typeof q.answer !== 'number') throw new Error('Falta opción correcta en una pregunta.');
                return q;
            });
            return {questions};
        }

    } else if(panel) {
        panel.style.display = 'none';
        const quizListDiv = document.getElementById('quiz-list');
        if (quizListDiv) quizListDiv.remove();
    }
}

renderAccessPage();
showQuestionUploadPanelIfTeacher();
