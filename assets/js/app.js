const STORAGE_KEYS = {
    tasks: "flowguard_tasks",
    focus: "flowguard_focus",
    moods: "flowguard_moods"
};

const elements = {
    taskForm: document.getElementById("task-form"),
    taskInput: document.getElementById("task-input"),
    taskTag: document.getElementById("task-tag"),
    taskList: document.getElementById("task-list"),
    completedCount: document.getElementById("completed-count"),
    focusCount: document.getElementById("focus-count"),
    moodScore: document.getElementById("mood-score"),
    startBtn: document.getElementById("start-btn"),
    pauseBtn: document.getElementById("pause-btn"),
    resetBtn: document.getElementById("reset-btn"),
    timerDisplay: document.getElementById("timer-display"),
    timerLength: document.getElementById("timer-length"),
    moodForm: document.getElementById("mood-form"),
    moodSelect: document.getElementById("mood-select"),
    moodNotes: document.getElementById("mood-notes"),
    moodLog: document.getElementById("mood-log"),
    purgeBtn: document.getElementById("purge-btn"),
    staleAlert: document.getElementById("stale-alert")
};

const state = {
    tasks: [],
    focusSessions: 0,
    moods: [],
    timer: {
        remainingSeconds: 25 * 60,
        interval: null,
        isRunning: false
    }
};

function safeParse(json, fallback) {
    try {
        const parsed = JSON.parse(json);
        return Array.isArray(fallback) && !Array.isArray(parsed) ? fallback : parsed ?? fallback;
    } catch (error) {
        console.warn("FlowGuard: ошибка чтения данных", error);
        return fallback;
    }
}

function loadState() {
    const storedTasks = localStorage.getItem(STORAGE_KEYS.tasks);
    const storedFocus = localStorage.getItem(STORAGE_KEYS.focus);
    const storedMoods = localStorage.getItem(STORAGE_KEYS.moods);

    state.tasks = safeParse(storedTasks, []);
    state.focusSessions = Number.parseInt(storedFocus ?? "0", 10) || 0;
    state.moods = safeParse(storedMoods, []);
}

function persist(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

function sanitizeText(value) {
    return value.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
}

function renderTasks() {
    const list = elements.taskList;
    list.textContent = "";

    if (state.tasks.length === 0) {
        const empty = document.createElement("li");
        empty.className = "empty-state";
        empty.textContent = "Задачи пока не добавлены — начните с главного приоритета дня.";
        list.appendChild(empty);
        return;
    }

    state.tasks
        .sort((a, b) => Number(a.completed) - Number(b.completed) || b.createdAt - a.createdAt)
        .forEach(task => {
            const item = document.createElement("li");
            item.className = "task-item" + (task.completed ? " completed" : "");
            item.dataset.taskId = task.id;

            const content = document.createElement("div");
            content.className = "task-content";

            const title = document.createElement("p");
            title.className = "task-title";
            title.textContent = task.title;

            const meta = document.createElement("p");
            meta.className = "task-meta";
            const formattedDate = new Date(task.createdAt).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit"
            });
            meta.textContent = `${task.tag} • ${formattedDate}`;

            content.append(title, meta);

            const actions = document.createElement("div");
            actions.className = "task-actions";

            const completeBtn = document.createElement("button");
            completeBtn.type = "button";
            completeBtn.textContent = task.completed ? "Вернуть" : "Готово";
            completeBtn.addEventListener("click", () => toggleTask(task.id));

            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.textContent = "Удалить";
            deleteBtn.addEventListener("click", () => deleteTask(task.id));

            actions.append(completeBtn, deleteBtn);
            item.append(content, actions);
            list.appendChild(item);
        });
}

function updateStats() {
    const completed = state.tasks.filter(task => task.completed).length;
    elements.completedCount.textContent = completed.toString();

    elements.focusCount.textContent = state.focusSessions.toString();

    if (state.moods.length === 0) {
        elements.moodScore.textContent = "—";
    } else {
        const avg = state.moods.reduce((total, entry) => total + entry.score, 0) / state.moods.length;
        elements.moodScore.textContent = avg.toFixed(1);
    }

    updateStaleIndicator();
}

function updateStaleIndicator() {
    const alert = elements.staleAlert;
    if (!alert) return;

    const timestamps = [
        ...state.tasks.map(task => task.createdAt),
        ...state.moods.map(entry => entry.timestamp)
    ];

    const lastEntry = timestamps.length ? Math.max(...timestamps) : 0;

    if (!lastEntry) {
        alert.hidden = true;
        return;
    }

    const daysSinceUpdate = (Date.now() - lastEntry) / (1000 * 60 * 60 * 24);
    alert.hidden = daysSinceUpdate < 3;
}

function addTask(event) {
    event.preventDefault();

    const title = sanitizeText(elements.taskInput.value);
    const tag = sanitizeText(elements.taskTag.value) || "Общее";

    if (!title) {
        elements.taskInput.focus();
        return;
    }

    const task = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title,
        tag,
        completed: false,
        createdAt: Date.now()
    };

    state.tasks.push(task);
    persist(STORAGE_KEYS.tasks, state.tasks);

    elements.taskForm.reset();
    renderTasks();
    updateStats();
}

function toggleTask(id) {
    const task = state.tasks.find(entry => entry.id === id);
    if (!task) return;

    task.completed = !task.completed;
    if (task.completed) {
        task.completedAt = Date.now();
    }

    persist(STORAGE_KEYS.tasks, state.tasks);
    renderTasks();
    updateStats();
}

function deleteTask(id) {
    state.tasks = state.tasks.filter(entry => entry.id !== id);
    persist(STORAGE_KEYS.tasks, state.tasks);
    renderTasks();
    updateStats();
}

function updateTimerDisplay(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
    elements.timerDisplay.textContent = `${mins}:${secs}`;
}

function startTimer() {
    if (state.timer.isRunning) return;

    state.timer.isRunning = true;
    const endTime = Date.now() + state.timer.remainingSeconds * 1000;

    state.timer.interval = window.setInterval(() => {
        const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        state.timer.remainingSeconds = remaining;
        updateTimerDisplay(remaining);

        if (remaining <= 0) {
            completeTimerCycle();
        }
    }, 1000);
}

function pauseTimer() {
    if (!state.timer.isRunning) return;
    state.timer.isRunning = false;
    window.clearInterval(state.timer.interval);
    state.timer.interval = null;
}

function resetTimer() {
    pauseTimer();
    const minutes = Number.parseInt(elements.timerLength.value, 10);
    state.timer.remainingSeconds = Number.isFinite(minutes) ? minutes * 60 : 25 * 60;
    updateTimerDisplay(state.timer.remainingSeconds);
}

function completeTimerCycle() {
    pauseTimer();
    const minutes = Number.parseInt(elements.timerLength.value, 10);
    state.timer.remainingSeconds = Number.isFinite(minutes) ? minutes * 60 : 25 * 60;
    updateTimerDisplay(state.timer.remainingSeconds);

    state.focusSessions += 1;
    persist(STORAGE_KEYS.focus, state.focusSessions);
    updateStats();
}

function handleTimerLengthChange() {
    const minutes = Number.parseInt(elements.timerLength.value, 10);
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 60) {
        elements.timerLength.value = "25";
        state.timer.remainingSeconds = 25 * 60;
        updateTimerDisplay(state.timer.remainingSeconds);
        return;
    }

    const wasRunning = state.timer.isRunning;
    pauseTimer();
    state.timer.remainingSeconds = minutes * 60;
    updateTimerDisplay(state.timer.remainingSeconds);
    if (wasRunning) {
        startTimer();
    }
}

function submitMood(event) {
    event.preventDefault();

    const score = Number.parseInt(elements.moodSelect.value, 10);
    if (!Number.isFinite(score)) {
        elements.moodSelect.focus();
        return;
    }

    const entry = {
        score,
        note: sanitizeText(elements.moodNotes.value).slice(0, 160),
        timestamp: Date.now()
    };

    state.moods.push(entry);
    persist(STORAGE_KEYS.moods, state.moods);

    elements.moodForm.reset();
    renderMoodLog();
    updateStats();
}

function renderMoodLog() {
    const log = elements.moodLog;
    log.textContent = "";

    const latest = [...state.moods].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
    if (latest.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "Добавляйте отметки, чтобы отслеживать настроение и предотвращать выгорание.";
        log.appendChild(empty);
        return;
    }

    latest.forEach(entry => {
        const wrapper = document.createElement("article");
        wrapper.className = "mood-entry";

        const title = document.createElement("p");
        const strong = document.createElement("strong");
        strong.textContent = "Настроение:";
        title.append(strong, ` ${entry.score}/5`);

        const time = document.createElement("p");
        time.className = "task-meta";
        time.textContent = new Date(entry.timestamp).toLocaleString("ru-RU", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit"
        });

        wrapper.append(title, time);

        if (entry.note) {
            const note = document.createElement("p");
            note.textContent = entry.note;
            wrapper.appendChild(note);
        }

        log.appendChild(wrapper);
    });
}

function purgeData() {
    if (!window.confirm("Очистить все сохранённые данные FlowGuard?")) {
        return;
    }

    state.tasks = [];
    state.focusSessions = 0;
    state.moods = [];

    persist(STORAGE_KEYS.tasks, state.tasks);
    persist(STORAGE_KEYS.focus, state.focusSessions);
    persist(STORAGE_KEYS.moods, state.moods);

    renderTasks();
    renderMoodLog();
    updateStats();
}

function initEventListeners() {
    elements.taskForm.addEventListener("submit", addTask);
    elements.startBtn.addEventListener("click", startTimer);
    elements.pauseBtn.addEventListener("click", pauseTimer);
    elements.resetBtn.addEventListener("click", resetTimer);
    elements.timerLength.addEventListener("change", handleTimerLengthChange);
    elements.moodForm.addEventListener("submit", submitMood);
    elements.purgeBtn.addEventListener("click", purgeData);
}

function init() {
    loadState();
    renderTasks();
    renderMoodLog();
    updateStats();
    resetTimer();
    initEventListeners();
}

document.addEventListener("DOMContentLoaded", init);
