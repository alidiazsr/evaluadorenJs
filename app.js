// --- Configuración de preguntas ---
let questions = [];

// --- Estado global ---
let participants = [];
let currentQuestion = 0;
let answers = [];
let timer = null;
let timeLeft = 30;
let quizStarted = false;
let role = null;
let myName = null;
let waitingForStart = true;
const app = document.getElementById('app');

// Firestore referencias
const roomId = 'sala1'; // puedes cambiarlo para tener varias salas
const roomRef = db.collection('rooms').doc(roomId);
const participantsRef = roomRef.collection('participants');

// Leer rol desde la URL
function getRoleFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('role');
}

function renderAccess() {
    app.innerHTML = `<h2>Acceso no válido</h2><p>Por favor, ingresa desde <a href='access.html'>la página de acceso</a>.</p>`;
}

function renderLogin() {
    app.innerHTML = `
        <h2>¡Bienvenida al Evaluador JS!</h2>
        <form id="login-form">
            <label>Ingresa tu nombre:</label><br>
            <input type="text" id="username" required autofocus><br>
            <button type="submit">Entrar</button>
        </form>
        <div class="participants">
            <strong>Participantes:</strong> <span id="participants-list">Nadie aún</span>
        </div>
    `;
    document.getElementById('login-form').onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('username').value.trim();
        if (name) {
            myName = name;
            // Agregar participante a Firestore
            await participantsRef.doc(name).set({name});
            waitingForStart = true;
            renderWaitingRoom();
        }
    };
    updateParticipants();
}

function renderTeacherRoom() {
    app.innerHTML = `
        <h2>Panel de Profesora</h2>
        <div class="participants">
            <strong>Participantes:</strong> <span id="participants-list">${participants.length ? participants.join(', ') : 'Nadie aún'}</span>
        </div>
        <button id="start-quiz-btn">Iniciar Evaluación</button>
    `;
    document.getElementById('start-quiz-btn').onclick = async () => {
        await roomRef.set({quizStarted: true, currentQuestion: 0}, {merge: true});
    };
}

function renderWaitingRoom() {
    app.innerHTML = `
        <h2>Esperando a que la profesora inicie...</h2>
        <div class="participants">
            <strong>Participantes:</strong> <span id="participants-list">${participants.length ? participants.join(', ') : 'Nadie aún'}</span>
        </div>
        <p>Por favor, espera a que la profesora comience la evaluación.</p>
    `;
}

function updateParticipants() {
    const list = document.getElementById('participants-list');
    if (list) {
        list.textContent = participants.length ? participants.join(', ') : 'Nadie aún';
    }
}

// Escuchar cambios en participantes en Firestore
participantsRef.onSnapshot(snapshot => {
    participants = snapshot.docs.map(doc => doc.id);
    updateParticipants();
});

async function startQuiz() {
    // Solo la profesora debe llamar a esto
    await roomRef.set({quizStarted: true, currentQuestion: 0}, {merge: true});
}

function showQuestion() {
    timeLeft = 30;
    const q = questions[currentQuestion];
    app.innerHTML = `
        <div class="participants"><strong>Participantes:</strong> ${participants.join(', ')}</div>
        <div class="timer" id="timer">⏰ ${timeLeft}s</div>
        <h3>Pregunta ${currentQuestion + 1} de ${questions.length}</h3>
        <p>${q.question}</p>
        <form id="answer-form">
            ${q.options.map((opt, i) => `
                <label><input type="radio" name="option" value="${i}" required> ${opt}</label><br>
            `).join('')}
            <button type="submit">Responder</button>
        </form>
    `;
    startTimer();
    document.getElementById('answer-form').onsubmit = async (e) => {
        e.preventDefault();
        const selected = parseInt(document.querySelector('input[name="option"]:checked').value);
        const responseTime = 30 - timeLeft;
        // Guardar respuesta en Firestore
        await roomRef.collection('answers').doc(myName).set({
            name: myName,
            correct: selected === q.answer,
            time: responseTime,
            question: currentQuestion
        });
        stopTimer();
        showResults();
    };
}

function startTimer() {
    document.getElementById('timer').textContent = `⏰ ${timeLeft}s`;
    timer = setInterval(() => {
        timeLeft--;
        document.getElementById('timer').textContent = `⏰ ${timeLeft}s`;
        if (timeLeft <= 0) {
            stopTimer();
            answers.push({
                name: participants[0],
                correct: false,
                time: 30
            });
            showResults();
        }
    }, 1000);
}

function stopTimer() {
    if (timer) clearInterval(timer);
}

async function showResults() {
    // Leer respuestas de Firestore para la pregunta actual
    const snapshot = await roomRef.collection('answers').where('question', '==', currentQuestion).get();
    const allAnswers = snapshot.docs.map(doc => doc.data());
    // Ordenar por correctos y tiempo
    const sorted = [...allAnswers].sort((a, b) => {
        if (b.correct !== a.correct) return b.correct - a.correct;
        return a.time - b.time;
    });
    // Mostrar justificación de la pregunta actual
    const q = questions[currentQuestion];
    app.innerHTML = `
        <h3>Resultados de la pregunta</h3>
        <table class="result-table">
            <tr><th>Nombre</th><th>Correcto</th><th>Tiempo (s)</th></tr>
            ${sorted.map(r => `
                <tr>
                    <td>${r.name}</td>
                    <td>${r.correct ? '✅' : '❌'}</td>
                    <td>${r.time}</td>
                </tr>
            `).join('')}
        </table>
        <div style="margin-top:16px; background:#f0f4fa; padding:12px; border-radius:8px;">
            <strong>Respuesta correcta:</strong> ${q.options[q.answer]}<br>
            <strong>Justificación:</strong> ${q.justification}
        </div>
        <div class="timer" id="timer"></div>
        ${role === 'teacher' ? '<button id="next-btn">Siguiente pregunta</button>' : ''}
    `;
    if (role === 'teacher') {
        document.getElementById('next-btn').onclick = async () => {
            // Avanzar pregunta en Firestore
            await roomRef.update({currentQuestion: currentQuestion + 1});
        };
    } else {
        let wait = 20;
        const waitTimer = setInterval(() => {
            wait--;
            document.getElementById('timer').textContent = `Siguiente pregunta en ${wait}s...`;
            if (wait <= 0) {
                clearInterval(waitTimer);
                // Esperar a que la profesora avance
            }
        }, 1000);
    }
}

function nextQuestion() {
    // Ya no se usa, el avance lo controla Firestore
}

async function showFinalResults() {
    // Leer todas las respuestas de Firestore
    const snapshot = await roomRef.collection('answers').get();
    const allAnswers = snapshot.docs.map(doc => doc.data());
    // Agrupar por participante y por pregunta (para evitar duplicados)
    const stats = {};
    allAnswers.forEach(a => {
        if (!stats[a.name]) stats[a.name] = {correct: 0, time: 0, preguntas: {}};
        // Solo contar una respuesta por pregunta por persona
        if (!stats[a.name].preguntas[a.question]) {
            if (a.correct) stats[a.name].correct++;
            stats[a.name].time += a.time;
            stats[a.name].preguntas[a.question] = true;
        }
    });
    const ranking = Object.entries(stats).map(([name, data]) => ({name, correct: data.correct, time: data.time}));
    ranking.sort((a, b) => b.correct - a.correct || a.time - b.time);
    app.innerHTML = `
        <h2>¡Evaluación finalizada!</h2>
        <h3>Ranking:</h3>
        <table class="result-table">
            <tr><th>Nombre</th><th>Correctas</th><th>Tiempo total (s)</th></tr>
            ${ranking.map(r => `
                <tr>
                    <td>${r.name}</td>
                    <td>${r.correct}</td>
                    <td>${r.time}</td>
                </tr>
            `).join('')}
        </table>
        <button onclick="location.reload()">Volver a empezar (solo recarga la página)</button>
        <button id="reset-btn">Reiniciar cuestionario (borrar todo)</button>
    `;
    document.getElementById('reset-btn').onclick = async () => {
        // Borrar participantes
        const parts = await participantsRef.get();
        for (const doc of parts.docs) await doc.ref.delete();
        // Borrar respuestas
        const answersSnap = await roomRef.collection('answers').get();
        for (const doc of answersSnap.docs) await doc.ref.delete();
        // Resetear estado de la sala
        await roomRef.set({quizStarted: false, currentQuestion: 0}, {merge: true});
        location.href = 'access.html';
    };
}

// Inicializar y sincronizar estado con Firestore
async function main() {
    role = getRoleFromUrl();
    if (!role) {
        renderAccess();
        return;
    }
    // Escuchar estado de la sala
    roomRef.onSnapshot(async doc => {
        const data = doc.data() || {};
        quizStarted = !!data.quizStarted;
        currentQuestion = data.currentQuestion || 0;
        // Cargar preguntas del cuestionario seleccionado
        if (data.quizId) {
            const quizDoc = await db.collection('quizzes').doc(data.quizId).get();
            questions = (quizDoc.exists && quizDoc.data().questions) ? quizDoc.data().questions : [];
        }
        if (quizStarted) {
            if (currentQuestion < questions.length) {
                showQuestion();
            } else {
                showFinalResults();
            }
        } else {
            if (role === 'teacher') {
                renderTeacherRoom();
            } else if (role === 'student') {
                if (myName) {
                    renderWaitingRoom();
                } else {
                    renderLogin();
                }
            }
        }
    });
}

main();
