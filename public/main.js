const MODEL = `gemma3:1b`;
const cont = document.getElementById('chat-container');
const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');

const loadModels = async () => {
    try {
        const res = await fetch('/models');
        document.getElementById('model-list').textContent = await res.text();
    } catch (err) {
        document.getElementById('model-list').textContent = `Error loading models. ${err}`;
    }
}

const loadSessionID = async () => {
    try {
        const res = await fetch('/sessionId');
        document.getElementById('sessionID').textContent = await res.text();
    } catch (err) {
        document.getElementById('model-list').textContent = `Error loading sessionID. ${err}`;
    }
}

const append = (sender, text, className) => {
    const info = `<strong>${sender}:</strong> ${text}`;
    message(info, className);
}

const message = (text, className) => {
    const div = document.createElement('div');
    div.classList.add('message', className);
    div.innerHTML = `${text}`;
    cont.appendChild(div);
    cont.scrollTop = cont.scrollHeight;
}

const removeLoading = () => {
    document.querySelectorAll('.loading-feedback').forEach(item => item.remove());
}

window.addEventListener('beforeunload', async (event) => {
    event.preventDefault();
    event.returnValue = true;
    const destroy = await fetch('/destroy');
});

window.addEventListener('DOMContentLoaded', () => {
    loadModels().then(r => loadSessionID());

    const div = document.createElement('p');
    div.innerHTML = `We are using <strong>${MODEL}</strong> model.`;
    document.getElementById(`info`).appendChild(div);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = input.value.trim();
        if (msg) {
            append('You', msg, 'user');
            message("🤖", `loading-feedback`);
            document.querySelectorAll('.submission-item').forEach(item => item.disabled = true);
            try {
                const res = await fetch(`/user/${MODEL}/` + encodeURIComponent(msg));
                if (res.ok) {
                    const data = await res.json();
                    removeLoading();
                    append(data.message.role, data.message.content, 'assistant');
                    setTimeout(() => {
                        input.value = '';
                        document.querySelectorAll('.submission-item').forEach(item => item.disabled = false);
                    }, 100);
                } else {
                    message(`🤖: Error on connecting with LLM`, `error-feedback`);
                }
            } catch (err) {
                console.error(err);
                message(`🤖: Error on connecting with LLM`, `error-feedback`);
            }
        }
    });

});