let peerConnections = {};
let dataChannels = {};
const configuration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
let username = "";
const COOLTIME = 5000; // 5秒（ミリ秒単位）

// クールタイムのチェックとボタン状態更新
function updateButtonState(roomId) {
    const sendButton = document.querySelector("button[onclick='sendMessage()']");
    const imageButton = document.querySelector("button[onclick=\"document.getElementById('imageUpload').click()\"]");
    const lastTime = parseInt(localStorage.getItem(`lastMessageTime_${username}_${roomId}`) || "0");
    const currentTime = Date.now();
    const timeLeft = COOLTIME - (currentTime - lastTime);

    if (timeLeft > 0) {
        const remainingSeconds = Math.ceil(timeLeft / 1000);
        sendButton.classList.add("disabled");
        imageButton.classList.add("disabled");
        sendButton.disabled = true;
        imageButton.disabled = true;
        sendButton.textContent = `書き込む (${remainingSeconds}秒)`;
        imageButton.textContent = `画像 (${remainingSeconds}秒)`;
        return true;
    } else {
        sendButton.classList.remove("disabled");
        imageButton.classList.remove("disabled");
        sendButton.disabled = false;
        imageButton.disabled = false;
        sendButton.textContent = "書き込む";
        imageButton.textContent = "画像";
        return false;
    }
}

// スレッド一覧の表示
if (window.location.pathname.includes("index.html")) {
    const threads = JSON.parse(localStorage.getItem("threads") || "[]");
    const threadList = document.getElementById("threadList");
    threads.forEach(thread => {
        const div = document.createElement("div");
        div.className = "thread-item";
        div.innerHTML = `<a href="chat.html?room=${thread.id}">${thread.title} (${thread.id})</a>`;
        threadList.appendChild(div);
    });
}

// スレッド作成
function createThread() {
    const title = document.getElementById("threadTitle").value.trim();
    if (!title) return alert("タイトルを入力してください");
    const roomId = Math.random().toString(36).substring(2, 8);
    const threads = JSON.parse(localStorage.getItem("threads") || "[]");
    threads.push({ id: roomId, title });
    localStorage.setItem("threads", JSON.stringify(threads));
    localStorage.setItem(`counter_${roomId}`, "0");
    window.location.href = `chat.html?room=${roomId}`;
}

// 全データリセット
function resetAllData() {
    if (confirm("本当に全てのデータをリセットしますか？")) {
        localStorage.clear();
        window.location.reload();
    }
}

// チャット画面の初期化
if (window.location.pathname.includes("chat.html")) {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get("room");
    if (!roomId) window.location.href = "404.html";

    const threads = JSON.parse(localStorage.getItem("threads") || "[]");
    const thread = threads.find(t => t.id === roomId);
    document.getElementById("currentRoom").textContent = roomId;
    document.getElementById("currentRoomTitle").textContent = thread ? thread.title : "スレッド";
    document.getElementById("roomName").textContent = thread ? thread.title : "スレッド";

    if (!localStorage.getItem(`username_${roomId}`)) {
        document.getElementById("usernamePrompt").style.display = "block";
    } else {
        username = localStorage.getItem(`username_${roomId}`);
        document.getElementById("usernamePrompt").style.display = "none";
        document.getElementById("chatArea").style.display = "block";
        setupWebRTC(roomId);
        loadMessages(roomId);
        setInterval(() => updateButtonState(roomId), 100);
        setInterval(() => syncMessages(roomId), 1000); // リアルタイム同期
    }
}

// ユーザー名設定
function setUsername() {
    const roomId = new URLSearchParams(window.location.search).get("room");
    username = document.getElementById("usernameInput").value.trim() || "名無しさん";
    localStorage.setItem(`username_${roomId}`, username);
    document.getElementById("usernamePrompt").style.display = "none";
    document.getElementById("chatArea").style.display = "block";
    setupWebRTC(roomId);
    loadMessages(roomId);
    setInterval(() => updateButtonState(roomId), 100);
    setInterval(() => syncMessages(roomId), 1000); // リアルタイム同期
}

// WebRTCセットアップ（リアルタイム対応）
function setupWebRTC(roomId) {
    peerConnections[roomId] = new RTCPeerConnection(configuration);
    dataChannels[roomId] = peerConnections[roomId].createDataChannel(`chat_${roomId}`);

    dataChannels[roomId].onopen = () => console.log("データチャンネルが開きました");
    dataChannels[roomId].onmessage = (event) => {
        const data = JSON.parse(event.data);
        displayMessage(data.message, roomId, false, data.counter, data.image);
    };

    peerConnections[roomId].onicecandidate = (event) => {
        if (event.candidate) {
            const candidates = JSON.parse(localStorage.getItem(`ice_${roomId}`) || "[]");
            candidates.push(event.candidate);
            localStorage.setItem(`ice_${roomId}`, JSON.stringify(candidates));
        }
    };

    peerConnections[roomId].createOffer()
        .then(offer => peerConnections[roomId].setLocalDescription(offer))
        .then(() => {
            localStorage.setItem(`offer_${roomId}`, JSON.stringify(peerConnections[roomId].localDescription));
        });

    // 他ピアの接続を監視
    setInterval(() => {
        const offer = JSON.parse(localStorage.getItem(`offer_${roomId}`) || "{}");
        const candidates = JSON.parse(localStorage.getItem(`ice_${roomId}`) || "[]");
        if (offer && !peerConnections[roomId].remoteDescription) {
            peerConnections[roomId].setRemoteDescription(new RTCSessionDescription(offer))
                .then(() => candidates.forEach(candidate => peerConnections[roomId].addIceCandidate(new RTCIceCandidate(candidate))))
                .catch(err => console.log("接続エラー:", err));
        }
    }, 1000);
}

// メッセージ読み込み
function loadMessages(roomId) {
    const messages = JSON.parse(localStorage.getItem(`chat_${roomId}`) || "[]");
    let counter = parseInt(localStorage.getItem(`counter_${roomId}`) || "0");
    document.getElementById("messages").innerHTML = ""; // 初期化
    messages.forEach((msg, index) => displayMessage(msg.message, roomId, false, index + 1, msg.image));
    localStorage.setItem(`counter_${roomId}`, counter.toString());
}

// メッセージ同期（リアルタイム用）
function syncMessages(roomId) {
    const messages = JSON.parse(localStorage.getItem(`chat_${roomId}`) || "[]");
    const currentMessageCount = document.getElementById("messages").childElementCount;
    if (messages.length > currentMessageCount) {
        loadMessages(roomId); // 新しいメッセージがあれば更新
    }
}

// メッセージ表示
function displayMessage(message, roomId, isNew = true, counter = null, imageBase64 = null) {
    const messageDiv = document.getElementById("messages");
    const p = document.createElement("p");
    const timestamp = new Date().toLocaleString("ja-JP");
    let messageCounter = counter !== null ? counter : parseInt(localStorage.getItem(`counter_${roomId}`) || "0") + 1;

    if (isNew) {
        localStorage.setItem(`counter_${roomId}`, messageCounter.toString());
    }

    const isAA = message.includes("\n") && !message.match(/[*>_~]/);
    let formattedMessage = message;
    if (!isAA) {
        formattedMessage = message
            .replace(/\n/g, "<br>")
            .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
            .replace(/_(.*?)_/g, "<em>$1</em>")
            .replace(/~(.*?)~/g, "<del>$1</del>")
            .replace(/^>(.*)$/gm, "<span class='quote'>$1</span>")
            .replace(/```(.*?)```/gs, "<code>$1</code>")
            .replace(/>>(\d+)/g, `<a href='#msg${roomId}_$1'>>$1</a>`)
            .replace(/(https?:\/\/[^\s]+)/g, "<a href='$1' target='_blank'>$1</a>");
    }

    let content = `${messageCounter}: ${formattedMessage} <span class="timestamp">[${timestamp}]</span>`;
    if (imageBase64) {
        content += `<br><img src="${imageBase64}" alt="アップロード画像">`;
    }

    p.id = `msg${roomId}_${messageCounter}`;
    p.innerHTML = content;
    messageDiv.appendChild(p);
    messageDiv.scrollTop = messageDiv.scrollHeight;
}

// メッセージ送信（リアルタイム対応）
function sendMessage() {
    const roomId = new URLSearchParams(window.location.search).get("room");
    const currentTime = Date.now();
    const lastTime = parseInt(localStorage.getItem(`lastMessageTime_${username}_${roomId}`) || "0");

    if (currentTime - lastTime < COOLTIME) {
        return;
    }

    const input = document.getElementById("messageInput");
    const messageText = input.value.trim();
    const message = `${username}: ${messageText}`;
    if (messageText) {
        if (messageText === "秘密の扉" || messageText === "隠し部屋") {
            window.location.href = "secret.html";
            return;
        }

        const counter = parseInt(localStorage.getItem(`counter_${roomId}`) || "0") + 1;
        displayMessage(message, roomId);
        const data = { message: message, counter: counter, image: null };
        if (dataChannels[roomId] && dataChannels[roomId].readyState === "open") {
            dataChannels[roomId].send(JSON.stringify(data));
        }

        const messages = JSON.parse(localStorage.getItem(`chat_${roomId}`) || "[]");
        messages.push({ message: message, image: null });
        localStorage.setItem(`chat_${roomId}`, JSON.stringify(messages));
        localStorage.setItem(`lastMessageTime_${username}_${roomId}`, currentTime.toString());

        input.value = "";
        updateButtonState(roomId);
    }
}

// 画像アップロード（リアルタイム対応）
function uploadImage() {
    const roomId = new URLSearchParams(window.location.search).get("room");
    const currentTime = Date.now();
    const lastTime = parseInt(localStorage.getItem(`lastMessageTime_${username}_${roomId}`) || "0");

    if (currentTime - lastTime < COOLTIME) {
        return;
    }

    const fileInput = document.getElementById("imageUpload");
    const file = fileInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64 = e.target.result;
            const message = `${username}: 画像をアップロードしました`;
            const counter = parseInt(localStorage.getItem(`counter_${roomId}`) || "0") + 1;
            displayMessage(message, roomId, true, null, base64);
            const data = { message: message, counter: counter, image: base64 };
            if (dataChannels[roomId] && dataChannels[roomId].readyState === "open") {
                dataChannels[roomId].send(JSON.stringify(data));
            }

            const messages = JSON.parse(localStorage.getItem(`chat_${roomId}`) || "[]");
            messages.push({ message: message, image: base64 });
            localStorage.setItem(`chat_${roomId}`, JSON.stringify(messages));
            localStorage.setItem(`lastMessageTime_${username}_${roomId}`, currentTime.toString());

            updateButtonState(roomId);
        };
        reader.readAsDataURL(file);
        fileInput.value = "";
    }
}

// ルームデータ削除
function deleteRoomData() {
    const roomId = new URLSearchParams(window.location.search).get("room");
    if (confirm("このスレッドのデータを削除しますか？")) {
        const threads = JSON.parse(localStorage.getItem("threads") || "[]");
        const updatedThreads = threads.filter(t => t.id !== roomId);
        localStorage.setItem("threads", JSON.stringify(updatedThreads));
        localStorage.removeItem(`chat_${roomId}`);
        localStorage.removeItem(`counter_${roomId}`);
        localStorage.removeItem(`username_${roomId}`);
        localStorage.removeItem(`lastMessageTime_${username}_${roomId}`);
        localStorage.removeItem(`ice_${roomId}`);
        localStorage.removeItem(`offer_${roomId}`);
        window.location.href = "index.html";
    }
}

// テーマ切り替え
function toggleTheme() {
    document.body.classList.toggle("dark");
    localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
}

// index.htmlに戻る
function returnToIndex() {
    window.location.href = "index.html";
}

// テーマの初期化
if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark");
}
