const socket = io({
  autoConnect: false,
});

/* ---------- STATE ---------- */
let username = "";
let currentRoom = "general";
let isLoggedIn = false;
let userRole = "user";
let currentUsers = [];
let isMentioning = false;
let mentionQuery = "";
let selectedMentionIndex = 0;
let currentThreadId = null;
let currentDMUser = null;
let dmConversations = {};

/* ---------- DOM REFERENCES ---------- */
const messages = document.getElementById("messages");
const messagesContainer = document.getElementById("messages-container");
const chatBackground = document.getElementById("chat-background");
const input = document.getElementById("input");
const typingIndicator = document.getElementById("typing-indicator");
const fileInput = document.getElementById("file-input");
const uploadBtn = document.getElementById("upload-btn");
const emojiInputBtn = document.getElementById("emoji-input-btn");
const emojiInputPickerContainer = document.getElementById("emoji-input-picker-container");
const inputEmojiPicker = document.getElementById("input-emoji-picker");
const mentionsContainer = document.getElementById("mentions-container");
const threadView = document.getElementById("thread-view");
const customRoomsList = document.getElementById("custom-rooms-list");
const dmPanel = document.getElementById("dm-panel");
const dmInput = document.getElementById("dm-input");
const dmList = document.getElementById("dm-list");
const searchInput = document.getElementById("search-input");
const searchModal = document.getElementById("search-modal");
const searchResultsList = document.getElementById("search-results-list");
const pinnedBar = document.getElementById("pinned-bar");
const pinnedSummary = document.getElementById("pinned-summary");
const pinnedListModal = document.getElementById("pinned-list-modal");
const pinnedMessagesContainer = document.getElementById("pinned-messages-container");
const adminBtn = document.getElementById("admin-btn");
const profileBtn = document.getElementById("profile-btn");
const profileModal = document.getElementById("profile-modal");
const displayNameInput = document.getElementById("displayName");
const profilePictureInput = document.getElementById("profilePicture");
const profilePictureUpload = document.getElementById("profile-picture-upload");
const themeToggle = document.getElementById("theme-toggle");
const userListUl = document.getElementById("userList");
const headerSpan = document.querySelector("#header span");

/* ---------- HELPER FUNCTIONS ---------- */

function showModal({
  title,
  body,
  prompt = false,
  promptValue = "",
  confirmText = "OK",
  cancelText = "Cancel",
  confirmClass = "primary",
}) {
  return new Promise((resolve) => {
    // Remove existing modal if any
    const existingModal = document.getElementById("custom-modal");
    if (existingModal) existingModal.remove();

    const modalBackdrop = document.createElement("div");
    modalBackdrop.id = "custom-modal";
    modalBackdrop.className = "modal-backdrop";

    let promptHTML = "";
    if (prompt) {
      promptHTML = `<input type="text" class="modal-input" value="${promptValue}">`;
    }

    modalBackdrop.innerHTML = `
      <div class="modal-content">
        <h2 class="modal-title">${title}</h2>
        <p class="modal-body">${body}</p>
        ${promptHTML}
        <div class="modal-buttons">
          <button class="modal-button secondary">${cancelText}</button>
          <button class="modal-button ${confirmClass}">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modalBackdrop);

    const confirmBtn = modalBackdrop.querySelector(".modal-button:last-child");
    const cancelBtn = modalBackdrop.querySelector(".modal-button:first-child");
    const inputEl = modalBackdrop.querySelector(".modal-input");

    const closeModal = (value) => {
      modalBackdrop.classList.remove("visible");
      setTimeout(() => {
        modalBackdrop.remove();
        resolve(value);
      }, 200);
    };

    confirmBtn.onclick = () => {
      closeModal(prompt ? inputEl.value : true);
    };

    cancelBtn.onclick = () => {
      closeModal(prompt ? null : false);
    };

    if (inputEl) {
      inputEl.focus();
      inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") confirmBtn.click();
        if (e.key === "Escape") cancelBtn.click();
      });
    }

    // Show with transition
    setTimeout(() => modalBackdrop.classList.add("visible"), 10);
  });
}

function openProfileModal() {
  profileModal.classList.add('visible');
  const token = localStorage.getItem('chatToken');
  fetch(`/api/profile/${username}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(res => res.json())
  .then(data => {
    if (data) {
      displayNameInput.value = data.displayName || data.username || '';
      profilePictureInput.value = data.profilePicture || '';
    }
  });
}

function closeProfileModal() {
  profileModal.classList.remove('visible');
}

async function saveProfile() {
  const newDisplayName = displayNameInput.value;
  let newProfilePicture = profilePictureInput.value;

  const file = profilePictureUpload.files[0];
  if (file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    
    const data = await res.json();
    if (data.filePath) {
      newProfilePicture = data.filePath;
    } else {
      showModal({ title: "Upload Error", body: data.error || "Failed to upload file." });
      return;
    }
  }

  const token = localStorage.getItem('chatToken');
  try {
    const res = await fetch(`/api/profile/${username}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        displayName: newDisplayName,
        profilePicture: newProfilePicture,
      })
    });
    const data = await res.json();
    if (data.success) {
      closeProfileModal();
      // Optionally, update the UI to reflect the changes immediately
      socket.emit("getUsers"); // Refresh user list to show updated display names
    } else {
      showModal({ title: "Error", body: data.error || "Failed to save profile" });
    }
  } catch (err) {
    showModal({ title: "Error", body: "Failed to save profile" });
  }
}

function generateUserColor(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return "#" + "00000".substring(0, 6 - c.length) + c;
}

function applyBackground(url) {
    if (url && url.trim()) {
        chatBackground.style.backgroundImage = `url('${url.trim()}')`;
    } else {
        chatBackground.style.backgroundImage = "none";
    }
}

async function loadUserBackground() {
    if (!username) return;
    try {
        const token = localStorage.getItem("chatToken");
        const res = await fetch(`/api/profile/${username}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.background) {
            applyBackground(data.background);
        }
    } catch (e) {
        console.error("Failed to load background", e);
    }
}

/* ---------- AUTH FUNCTIONS ---------- */

function showAuthModal() {
  const modal = document.createElement("div");
  modal.id = "auth-modal";
  modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;

  const content = document.createElement("div");
  content.style.cssText = `
        background: var(--panel);
        padding: 30px;
        border-radius: 10px;
        text-align: center;
        width: 300px;
    `;

  content.innerHTML = `
        <h2 style="margin-top: 0; color: var(--text);">Chat App</h2>
        
        <div id="auth-form">
            <input type="text" id="auth-username" placeholder="Username (3+ chars)" 
                   style="width: 100%; padding: 10px; margin: 8px 0; border: none; border-radius: 5px; background: var(--bg); color: var(--text);">
            <input type="password" id="auth-password" placeholder="Password (4+ chars)" 
                   style="width: 100%; padding: 10px; margin: 8px 0; border: none; border-radius: 5px; background: var(--bg); color: var(--text);">
            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <button id="login-btn" style="flex: 1; padding: 10px; background: var(--accent); border: none; border-radius: 5px; color: white; cursor: pointer;">Login</button>
                <button id="register-btn" style="flex: 1; padding: 10px; background: #4ECDC4; border: none; border-radius: 5px; color: white; cursor: pointer;">Register</button>
            </div>
            <div id="auth-error" style="color: #FF6B6B; font-size: 12px; margin-top: 10px;"></div>
        </div>
    `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  const usernameInput = document.getElementById("auth-username");
  const passwordInput = document.getElementById("auth-password");
  const loginBtn = document.getElementById("login-btn");
  const registerBtn = document.getElementById("register-btn");
  const errorDiv = document.getElementById("auth-error");

  usernameInput.focus();

  async function handleLogin() {
    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const data = await res.json();

      if (data.success) {
        username = data.username;
        isLoggedIn = true;
        localStorage.setItem("chatToken", data.token);

        try {
          const tokenPayload = JSON.parse(atob(data.token.split(".")[1]));
          userRole = tokenPayload.role || "user";
        } catch (e) {
          userRole = "user";
        }

        if (userRole === "admin") {
          adminBtn.style.display = "block";
        }
        profileBtn.style.display = "block";

        document.body.removeChild(modal);
        socket.auth = { token: data.token };
        socket.connect();
        socket.once("connect", () => {
          socket.emit("joinRoom", { room: currentRoom });
        });
        loadUserBackground();
      } else {
        errorDiv.textContent = data.error;
      }
    } catch (err) {
      errorDiv.textContent = "Connection error";
    }
  }

  async function handleRegister() {
    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const data = await res.json();

      if (data.success) {
        errorDiv.style.color = "#4ECDC4";
        errorDiv.textContent = "Account created! Now login.";
        usernameInput.value = "";
        passwordInput.value = "";
        passwordInput.focus();
      } else {
        errorDiv.style.color = "#FF6B6B";
        errorDiv.textContent = data.error;
      }
    } catch (err) {
      errorDiv.textContent = "Connection error";
    }
  }

  loginBtn.addEventListener("click", handleLogin);
  registerBtn.addEventListener("click", handleRegister);
  usernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") passwordInput.focus();
  });
  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });
}

function logout() {
  localStorage.removeItem("chatToken");
  window.location.reload();
}

async function deleteAccount() {
  const confirmed = await showModal({
    title: "Delete Account",
    body: "Are you sure you want to delete your account? This action cannot be undone and will delete all your messages, reactions, and data.",
    confirmText: "Delete",
    confirmClass: "danger",
  });
  if (!confirmed) return;

  const password = await showModal({
    title: "Confirm Deletion",
    body: "Please enter your password to confirm deletion:",
    prompt: true,
    confirmText: "Confirm",
    confirmClass: "danger",
  });
  if (!password) return;

  try {
    const token = localStorage.getItem("chatToken");
    const res = await fetch(`/api/admin/user/${username}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();

    if (data.success) {
      await showModal({
        title: "Success",
        body: "Your account has been deleted successfully.",
        confirmText: "OK",
        cancelText: "",
      });
      localStorage.removeItem("chatToken");
      window.location.reload();
    } else {
      showModal({
        title: "Error",
        body: data.error || "Failed to delete account",
      });
    }
  } catch (err) {
    showModal({ title: "Error", body: "Error deleting account" });
  }
}


/* ---------- MESSAGE FUNCTIONS ---------- */

function send() {
  if (!input.value.trim()) return;
  if (!username) {
    console.error("Username not set!");
    return;
  }
  socket.emit("sendMessage", { message: input.value, roomId: currentRoom, parentMessageId: null });
  socket.emit("stop typing");
  input.value = "";
}

function displayMessage(data) {
  if (!data || !data.username) return;

  const li = document.createElement("li");
  li.className = "message";
  li.id = `msg-${data.id}`;

  const isSelf = data.username === username;
  if (isSelf) li.classList.add("self");

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  if (data.profilePicture) {
    avatar.style.backgroundImage = `url('${data.profilePicture}')`;
    avatar.style.backgroundSize = 'cover';
    avatar.textContent = '';
  } else {
    avatar.textContent = (data.displayName || data.username)[0].toUpperCase();
    avatar.style.backgroundColor = data.userColor || "#5865f2";
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  let editLabel = data.edited ? " (edited)" : "";
  const metaDiv = document.createElement("div");
  metaDiv.className = "meta";
  const usernameSpan = document.createElement("span");
  usernameSpan.className = "message-username";
  usernameSpan.style.cursor = "pointer";
  usernameSpan.style.color = "var(--accent)";
  usernameSpan.textContent = data.displayName || data.username;
  metaDiv.appendChild(usernameSpan);
  metaDiv.appendChild(
    document.createTextNode(
      " • " + new Date(data.timestamp).toLocaleTimeString() + editLabel,
    ),
  );

  const msgContentDiv = document.createElement("div");
  msgContentDiv.className = "message-content";

  if (data.message.startsWith("/uploads/")) {
    const img = document.createElement("img");
    img.src = data.message;
    img.style.maxWidth = "100%";
    img.style.borderRadius = "5px";
    img.style.marginTop = "5px";
    msgContentDiv.appendChild(img);
  } else {
    const mentionRegex = /@(\w+)/g;
    let finalMessage = data.message;
    
    finalMessage = finalMessage.replace(mentionRegex, (match, mentionedUser) => {
        if (currentUsers.includes(mentionedUser)) {
            if (mentionedUser === username) {
                li.classList.add("mentioned");
            }
            return `<span class="mention-tag">@${mentionedUser}</span>`;
        }
        return match;
    });
    
    msgContentDiv.innerHTML = finalMessage;
  }

  bubble.appendChild(metaDiv);
  bubble.appendChild(msgContentDiv);

  if (data.link_preview) {
    let preview = data.link_preview;
    if (typeof preview === "string") {
      try {
        preview = JSON.parse(preview);
      } catch (e) {
        console.error("Failed to parse link preview", e);
      }
    }

    if (preview && typeof preview === "object") {
        const previewDiv = document.createElement("a");
        previewDiv.href = preview.url;
        previewDiv.target = "_blank";
        previewDiv.className = "link-preview";
        previewDiv.style.cssText = `
            display: block;
            margin-top: 10px;
            background: rgba(0,0,0,0.2);
            border-left: 3px solid var(--accent);
            padding: 8px;
            text-decoration: none;
            color: inherit;
            border-radius: 4px;
        `;

        let previewHTML = `<div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${preview.title}</div>`;
        if (preview.description) {
            previewHTML += `<div style="font-size: 12px; color: var(--muted); margin-bottom: 4px;">${preview.description}</div>`;
        }
        if (preview.image) {
            previewHTML += `<img src="${preview.image}" style="max-width: 100%; border-radius: 4px; margin-top: 4px;">`;
        }
        previewDiv.innerHTML = previewHTML;
        bubble.appendChild(previewDiv);
    }
  }

  if (isSelf && data.id) {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    actions.innerHTML = `
            <button class="btn-edit" data-msg-id="${data.id}">Edit</button>
            <button class="btn-delete" data-msg-id="${data.id}">Delete</button>
            <button class="btn-react" data-msg-id="${data.id}">React</button>
        `;
    bubble.appendChild(actions);
  } else if (data.id) {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    let buttons = `<button class="btn-reply" onclick="openThread(${data.id})">Reply</button>`;

    if (userRole === "admin") {
      buttons += `<button class="btn-admin-delete" data-msg-id="${data.id}" style="background: var(--danger); color: white;">Delete</button>`;
      buttons += `<button class="btn-admin-pin" onclick="pinMessage(${data.id})" style="background: var(--accent); color: white; margin-left: 5px;">Pin</button>`;
    }

    actions.innerHTML = buttons;
    bubble.appendChild(actions);

    const replyLink = document.createElement('div');
    replyLink.className = 'reply-link';
    replyLink.id = `reply-link-${data.id}`;
    if (data.reply_count > 0) {
        replyLink.textContent = `${data.reply_count} ${data.reply_count === 1 ? 'reply' : 'replies'}`;
        replyLink.onclick = () => openThread(data.id);
        bubble.appendChild(replyLink);
    }
  }

  if (data.id) {
    const reactionsDiv = document.createElement("div");
    reactionsDiv.className = "reactions-container";
    reactionsDiv.id = `reactions-${data.id}`;
    bubble.appendChild(reactionsDiv);
  }

  li.appendChild(avatar);
  li.appendChild(bubble);
  messages.appendChild(li);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function editMessage(messageId) {
  const messageEl = document.getElementById(`msg-${messageId}`);
  const currentMessage =
    messageEl?.querySelector(".message-content")?.textContent;

  const newMsg = await showModal({
    title: "Edit Message",
    body: "Please enter your new message:",
    prompt: true,
    promptValue: currentMessage || "",
    confirmText: "Save",
  });
  if (newMsg && newMsg.trim() && newMsg.trim() !== currentMessage) {
    socket.emit("editMessage", { messageId, newMessage: newMsg.trim() });
  }
}

async function deleteMessage(messageId) {
  const confirmed = await showModal({
    title: "Delete Message",
    body: "Are you sure you want to delete this message?",
    confirmText: "Delete",
    confirmClass: "danger",
  });
  if (confirmed) {
    socket.emit("deleteMessage", { messageId });
  }
}

function showEmojiPicker(messageId, event) {
  const existing = document.getElementById("reaction-picker");
  if (existing) existing.remove();

  const picker = document.createElement("emoji-picker");
  picker.id = "reaction-picker";
  picker.style.position = "fixed";
  picker.style.zIndex = "2000";
  
  picker.style.top = Math.min(event.clientY, window.innerHeight - 450) + "px";
  picker.style.left = Math.min(event.clientX, window.innerWidth - 350) + "px";

  picker.addEventListener('emoji-click', e => {
    const emoji = e.detail.unicode;
    socket.emit("add reaction", { messageId, emoji });
    picker.remove();
  });

  document.body.appendChild(picker);

  setTimeout(() => {
    const closePicker = (clickEvent) => {
        if (!picker.contains(clickEvent.target)) {
            picker.remove();
            document.removeEventListener("click", closePicker);
        }
    };
    document.addEventListener("click", closePicker);
  }, 100);
}

function updateReactions(messageId, reactions) {
  const container = document.getElementById(`reactions-${messageId}`);
  if (!container) return;

  container.innerHTML = "";
  if (!reactions || reactions.length === 0) return;

  reactions.forEach(({ emoji, count }) => {
    const btn = document.createElement("button");
    btn.className = "reaction-btn";
    btn.innerHTML = `${emoji} <span>${count}</span>`;
    btn.type = "button";
    btn.dataset.emoji = emoji;
    btn.dataset.messageId = messageId;
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      socket.emit("remove reaction", {
        messageId: parseInt(this.dataset.messageId),
        emoji: this.dataset.emoji,
      });
    });
    container.appendChild(btn);
  });
}

/* ---------- THREAD FUNCTIONS ---------- */

function openThread(parent_message_id) {
    if (currentThreadId) {
        socket.emit('leave thread', {parent_message_id: currentThreadId});
    }
    currentThreadId = parent_message_id;
    socket.emit('get thread', {parent_message_id});
    threadView.classList.add('visible');
}

function closeThread() {
    if (currentThreadId) {
        socket.emit('leave thread', {parent_message_id: currentThreadId});
    }
    currentThreadId = null;
    threadView.classList.remove('visible');
    threadView.innerHTML = '';
}

function renderThreadView(parent_message_id, messages) {
    threadView.innerHTML = `
        <div class="thread-header">
            <span>Thread</span>
            <button class="close-thread" onclick="closeThread()">×</button>
        </div>
        <ul id="thread-messages">
        </ul>
        <div class="thread-input-area">
            <textarea id="thread-input" placeholder="Reply..."></textarea>
            <button onclick="sendThreadMessage()">Send</button>
        </div>
    `;

    const threadMessages = document.getElementById("thread-messages");
    messages.forEach(msg => {
        const li = document.createElement("li");
        li.className = "message";
        li.id = `thread-msg-${msg.id}`;

        let avatarHtml = '';
        if (msg.profilePicture) {
            avatarHtml = `<div class="avatar" style="background-image: url('${msg.profilePicture}'); background-size: cover;"></div>`;
        } else {
            avatarHtml = `<div class="avatar" style="background-color:${generateUserColor(msg.username)}">${(msg.displayName || msg.username)[0].toUpperCase()}</div>`;
        }

        li.innerHTML = `
                ${avatarHtml}
                <div class="bubble">
                    <div class="meta">
                        <span class="message-username">${msg.displayName || msg.username}</span> • ${new Date(msg.timestamp).toLocaleTimeString()}
                    </div>
                    <div class="message-content">${msg.message}</div>
                </div>
            `;
        threadMessages.appendChild(li);
    });
    threadMessages.scrollTop = threadMessages.scrollHeight;
}

function sendThreadMessage() {
    const threadInput = document.getElementById("thread-input");
    if (!threadInput.value.trim()) return;
    socket.emit('chat message', {msg: threadInput.value, parent_message_id: currentThreadId});
    threadInput.value = '';
}

/* ---------- ROOM FUNCTIONS ---------- */

function createRoom() {
    console.log("createRoom called");
    showModal({
        title: "Create New Channel",
        body: "Enter channel name:",
        prompt: true,
        confirmText: "Create"
    }).then(name => {
        console.log(`First modal resolved with name: ${name}`);
        if (name && name.trim()) {
            showModal({
                title: "Private Channel?",
                body: "Set a password to make this channel private (leave empty for public):",
                prompt: true,
                confirmText: "Set"
            }).then(password => {
                console.log(`Second modal resolved with password: ${password ? 'SET' : 'NONE'}`);
                socket.emit("create room", { name, password });
            });
        }
    });
}

function addRoomToList(roomName, isPrivate) {
    if (document.querySelector(`.room[data-room="${roomName}"]`)) return;

    const div = document.createElement("div");
    div.className = "room";
    div.dataset.room = roomName;
    div.dataset.private = isPrivate;
    div.onclick = () => switchRoom(roomName, div);
    
    let content = `# ${roomName} ${isPrivate ? '🔒' : ''}`;
    if (userRole === "admin") {
        content += ` <button onclick="deleteRoom(event, '${roomName}')" style="background: none; border: none; color: #ff6b6b; font-size: 10px; cursor: pointer;">[x]</button>`;
    }
    
    div.innerHTML = `${content} <span class="badge"></span>`;
    customRoomsList.appendChild(div);
}

function deleteRoom(event, name) {
    event.stopPropagation();
    showModal({
        title: "Delete Channel",
        body: `Are you sure you want to delete #${name}?`,
        confirmText: "Delete",
        confirmClass: "danger"
    }).then(confirmed => {
        if (confirmed) {
            socket.emit("delete room", { name });
        }
    });
}

function switchRoom(room, el, password = null) {
  if (el && el.dataset.private === "true" && !password && userRole !== "admin") {
      showModal({
          title: "Private Channel",
          body: "Enter password:",
          prompt: true,
          confirmText: "Join"
      }).then(enteredPassword => {
          if (enteredPassword !== null) {
              switchRoom(room, el, enteredPassword);
          }
      });
      return;
  }

  document
    .querySelectorAll(".room")
    .forEach((r) => r.classList.remove("active"));
  if (el) el.classList.add("active");

  headerSpan.textContent = `# ${room}`;

  currentRoom = room;
  messages.innerHTML = "";
  socket.emit("joinRoom", { username, room, password });
}

/* ---------- PROFILE FUNCTIONS ---------- */

async function showUserProfileModal(targetUsername) {
  const modal = document.createElement("div");
  modal.id = "user-profile-modal-dynamic";
  modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;

  const content = document.createElement("div");
  content.style.cssText = `
        background: var(--panel);
        padding: 30px;
        border-radius: 10px;
        text-align: center;
        width: 400px;
        max-width: 90vw;
    `;

  content.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h2 style="margin: 0; color: var(--text);">User Profile</h2>
            <button id="close-profile" style="background: none; border: none; color: var(--text-secondary); font-size: 24px; cursor: pointer;">×</button>
        </div>
        
        <div id="profile-content">
            <div style="text-align: center; margin-bottom: 20px;">
                <div id="profile-avatar" style="width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 15px; background: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 32px; color: white;"></div>
                <h3 id="profile-username" style="margin: 0; color: var(--text);"></h3>
                <div id="profile-role" style="color: var(--text-secondary); font-size: 14px; margin-top: 5px;"></div>
            </div>
            
            <div id="profile-fields" style="display: none;">
                <div style="margin-bottom: 15px;">
                    <label style="display: block; color: var(--text-secondary); margin-bottom: 5px;">Bio</label>
                    <textarea id="profile-bio" placeholder="Tell us about yourself..." 
                        style="width: 100%; padding: 10px; border: none; border-radius: 5px; background: var(--bg); color: var(--text); resize: vertical; min-height: 60px;"></textarea>
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: var(--text-secondary); margin-bottom: 5px;">Status</label>
                    <input type="text" id="profile-status" placeholder="What's on your mind?" 
                        style="width: 100%; padding: 10px; border: none; border-radius: 5px; background: var(--bg); color: var(--text);">
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: var(--text-secondary); margin-bottom: 5px;">Chat Background (URL)</label>
                    <input type="text" id="profile-background" placeholder="https://example.com/image.jpg" 
                        style="width: 100%; padding: 10px; border: none; border-radius: 5px; background: var(--bg); color: var(--text);">
                </div>
                <div style="display: flex; gap: 10px;">
                    <button id="save-profile" style="flex: 1; padding: 10px; background: var(--accent); border: none; border-radius: 5px; color: white; cursor: pointer;">Save</button>
                    <button id="cancel-profile" style="flex: 1; padding: 10px; background: rgba(255,255,255,0.1); border: none; border-radius: 5px; color: var(--text); cursor: pointer;">Cancel</button>
                </div>
            </div>
            
            <div id="profile-view">
                <div style="margin-bottom: 15px;">
                    <label style="display: block; color: var(--text-secondary); margin-bottom: 5px;">Bio</label>
                    <div id="profile-bio-display" style="background: var(--bg); padding: 10px; border-radius: 5px; color: var(--text); min-height: 40px; text-align: left;"></div>
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: var(--text-secondary); margin-bottom: 5px;">Status</label>
                    <div id="profile-status-display" style="background: var(--bg); padding: 10px; border-radius: 5px; color: var(--text); min-height: 40px; text-align: left;"></div>
                </div>
                <button id="edit-profile" style="width: 100%; padding: 10px; background: var(--accent); border: none; border-radius: 5px; color: white; cursor: pointer; display: none;">Edit Profile</button>
            </div>
        </div>
    `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  const closeBtn = document.getElementById("close-profile");
  const editBtn = document.getElementById("edit-profile");
  const saveBtn = document.getElementById("save-profile");
  const cancelBtn = document.getElementById("cancel-profile");
  const profileView = document.getElementById("profile-view");
  const profileFields = document.getElementById("profile-fields");

  closeBtn.onclick = () => document.body.removeChild(modal);

  try {
    const token = localStorage.getItem("chatToken");
    const res = await fetch(
      `/api/profile/${targetUsername}`,
      token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    );
    const data = await res.json();

    if (data.error) {
      showModal({ title: "Error", body: data.error });
      document.body.removeChild(modal);
      return;
    }

    document.getElementById("profile-username").textContent = data.username;
    document.getElementById("profile-avatar").textContent =
      data.username[0].toUpperCase();
    document.getElementById("profile-role").textContent =
      data.role.charAt(0).toUpperCase() + data.role.slice(1);
    document.getElementById("profile-bio-display").textContent =
      data.bio || "No bio set";
    document.getElementById("profile-status-display").textContent =
      data.status || "No status set";

    if (targetUsername === username) {
      editBtn.style.display = "block";
      editBtn.onclick = () => {
        document.getElementById("profile-bio").value = data.bio || "";
        document.getElementById("profile-status").value = data.status || "";
        document.getElementById("profile-background").value = data.background || "";
        profileView.style.display = "none";
        profileFields.style.display = "block";
      };
    }

    saveBtn.onclick = async () => {
      const bio = document.getElementById("profile-bio").value.trim();
      const status = document.getElementById("profile-status").value.trim();
      const background = document.getElementById("profile-background").value.trim();

      try {
        const token = localStorage.getItem("chatToken");
        const headers = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`/api/profile/${username}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ bio, status, background }),
        });
        const result = await res.json();

        if (result.success) {
          document.body.removeChild(modal);
          applyBackground(background);
          socket.emit("getUsers");
        } else {
          showModal({ title: "Error", body: result.error });
        }
      } catch (err) {
        showModal({ title: "Error", body: "Failed to update profile" });
      }
    };


    cancelBtn.onclick = () => {
      profileView.style.display = "block";
      profileFields.style.display = "none";
    };
  } catch (err) {
    showModal({ title: "Error", body: "Failed to load profile" });
    document.body.removeChild(modal);
  }
}

/* ---------- ADMIN FUNCTIONS ---------- */

async function loadAuditLog() {
    try {
        const token = localStorage.getItem("chatToken");
        const res = await fetch('/api/admin/audit-log', token ? { headers: { 'Authorization': `Bearer ${token}` } } : {});
        const logs = await res.json();

        const logList = document.getElementById('audit-log-list');
        logList.innerHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="text-align: left; border-bottom: 1px solid var(--bg);">
                        <th style="padding: 10px;">Admin</th>
                        <th style="padding: 10px;">Action</th>
                        <th style="padding: 10px;">Target</th>
                        <th style="padding: 10px;">Reason</th>
                        <th style="padding: 10px;">Timestamp</th>
                    </tr>
                </thead>
                <tbody>
                ${logs.map(log => `
                    <tr style="border-bottom: 1px solid var(--bg);">
                        <td style="padding: 10px;">${log.admin_username}</td>
                        <td style="padding: 10px;">${log.action.replace('_', ' ')}</td>
                        <td style="padding: 10px;">${log.target_username || 'N/A'}</td>
                        <td style="padding: 10px; font-style: italic; color: var(--muted);">${log.reason || 'N/A'}</td>
                        <td style="padding: 10px;">${new Date(log.timestamp).toLocaleString()}</td>
                    </tr>
                `).join('')}
                </tbody>
            </table>
        `;

    } catch (err) {
        const auditLogList = document.getElementById('audit-log-list');
        if (auditLogList) auditLogList.innerHTML = "<div style='color: var(--danger);'>Failed to load audit log.</div>";
    }
}

async function loadAdminUsers() {
  try {
    const token = localStorage.getItem("chatToken");
    const res = await fetch(
      "/api/admin/users",
      token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    );
    const users = await res.json();

    const userList = document.getElementById("user-list");
    userList.innerHTML = "";

    users.forEach((user) => {
      const userDiv = document.createElement("div");
      userDiv.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 15px;
                background: var(--bg);
                border-radius: 8px;
                margin-bottom: 10px;
                gap: 10px;
            `;

      // Safe DOM construction instead of innerHTML
      const infoDiv = document.createElement("div");
      infoDiv.style.cssText = "display: flex; align-items: center; gap: 15px; flex: 1; min-width: 0;";
      
      const avatarDiv = document.createElement("div");
      avatarDiv.style.cssText = "width: 40px; height: 40px; border-radius: 50%; background: var(--accent); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;";
      avatarDiv.textContent = user.username[0].toUpperCase();
      
      const detailsDiv = document.createElement("div");
      const usernameDiv = document.createElement("div");
      usernameDiv.style.color = "var(--text)";
      usernameDiv.style.fontWeight = "bold";
      usernameDiv.textContent = user.username;
      
      const metaDiv = document.createElement("div");
      metaDiv.style.color = "var(--text-secondary)";
      metaDiv.style.fontSize = "12px";
      metaDiv.textContent = `Role: ${user.role} • Joined: ${new Date(user.created_at).toLocaleDateString()}`;
      
      detailsDiv.appendChild(usernameDiv);
      detailsDiv.appendChild(metaDiv);
      infoDiv.appendChild(avatarDiv);
      infoDiv.appendChild(detailsDiv);

      // Role select dropdown
      const select = document.createElement("select");
      select.style.cssText = "padding: 5px; border: none; border-radius: 4px; background: var(--panel); color: var(--text); width: 120px; flex-shrink: 0;";
      select.dataset.username = user.username;
      
      ["user", "moderator", "admin"].forEach(role => {
        const option = document.createElement("option");
        option.value = role;
        option.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        if (user.role === role) option.selected = true;
        select.appendChild(option);
      });
      
      select.addEventListener("change", () => changeUserRole(select.dataset.username, select.value));

      // Ban button
      const banBtn = document.createElement("button");
      banBtn.textContent = "Ban";
      banBtn.style.cssText = "padding: 5px 10px; border: none; border-radius: 4px; background: #FF6B6B; color: white; cursor: pointer; flex-shrink: 0;";
      banBtn.onclick = () => adminBanUser(user.username);

      // Kick button
      const kickBtn = document.createElement("button");
      kickBtn.textContent = "Kick";
      kickBtn.style.cssText = "padding: 5px 10px; border: none; border-radius: 4px; background: #FFA500; color: white; cursor: pointer; flex-shrink: 0;";
      kickBtn.onclick = () => adminKickUser(user.username);

      userDiv.appendChild(infoDiv);
      userDiv.appendChild(select);
      userDiv.appendChild(banBtn);
      userDiv.appendChild(kickBtn);
      userList.appendChild(userDiv);
    });
  } catch (err) {
    const userList = document.getElementById("user-list");
    if (userList) {
      const errorDiv = document.createElement("div");
      errorDiv.style.color = "var(--danger)";
      errorDiv.textContent = "Failed to load users";
      userList.appendChild(errorDiv);
    }
  }
}

async function changeUserRole(username, newRole) {
  try {
    const token = localStorage.getItem("chatToken");
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`/api/admin/role/${username}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ role: newRole }),
    });
    const result = await res.json();

    if (!result.success) {
      showModal({ title: "Error", body: result.error });
      loadAdminUsers();
      loadAuditLog();
    }
  } catch (err) {
    showModal({ title: "Error", body: "Failed to change role" });
    loadAdminUsers();
      loadAuditLog();
  }
}

async function adminBanUser(username) {
    const reason = await showModal({
        title: `Ban User: ${username}`,
        body: "Enter reason for ban (optional):",
        prompt: true,
        confirmText: "Ban",
        confirmClass: "danger"
    });

    if (reason !== null) {
        try {
            const token = localStorage.getItem("chatToken");
            const res = await fetch('/api/admin/ban', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ username, reason })
            });

            const result = await res.json();
            if (result.success) {
                showModal({ title: "Success", body: `User ${username} has been banned.` });
                loadAdminUsers();
      loadAuditLog();
            } else {
                showModal({ title: "Error", body: result.error || "Failed to ban user." });
            }
        } catch (err) {
            showModal({ title: "Error", body: "An unexpected error occurred." });
        }
    }
}

async function adminKickUser(username) {
    const confirmed = await showModal({
        title: `Kick User: ${username}`,
        body: `Are you sure you want to kick ${username}? They will be able to rejoin.`,
        confirmText: "Kick",
        confirmClass: "danger"
    });

    if (confirmed) {
        try {
            const token = localStorage.getItem("chatToken");
            const res = await fetch('/api/admin/kick', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ username })
            });

            const result = await res.json();
            if (result.success) {
                showModal({ title: "Success", body: `User ${username} has been kicked.` });
            } else {
                showModal({ title: "Error", body: result.error || "Failed to kick user." });
            }
        } catch (err) {
            showModal({ title: "Error", body: "An unexpected error occurred." });
        }
    }
}

function showAdminPanel() {
  if (userRole !== "admin") return;

  const modal = document.createElement("div");
  modal.id = "admin-modal";
  modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;

  const content = document.createElement("div");
  content.style.cssText = `
        background: var(--panel);
        padding: 30px;
        border-radius: 10px;
        width: 800px;
        max-width: 90vw;
        max-height: 80vh;
        overflow-y: auto;
    `;

  content.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h2 style="margin: 0; color: var(--text);">Admin Panel</h2>
            <button id="close-admin" style="background: none; border: none; color: var(--text-secondary); font-size: 24px; cursor: pointer;">×</button>
        </div>
        
        <div class="admin-tabs" style="display:flex; border-bottom: 1px solid var(--bg); margin-bottom: 20px;">
            <button class="admin-tab-btn active" data-tab="users">User Management</button>
            <button class="admin-tab-btn" data-tab="audit">Audit Log</button>
        </div>

        <div id="admin-content" class="admin-tab-content" data-tab-content="users">
            <h3 style="color: var(--text); margin-bottom: 15px;">User Management</h3>
            <div id="user-list" style="margin-bottom: 30px;"></div>
        </div>
        <div id="audit-log-content" class="admin-tab-content" data-tab-content="audit" style="display:none;">
            <h3 style="color: var(--text); margin-bottom: 15px;">Audit Log</h3>
            <div id="audit-log-list"></div>
        </div>
    `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  document.getElementById("close-admin").onclick = () =>
    document.body.removeChild(modal);
  
  const tabButtons = content.querySelectorAll('.admin-tab-btn');
  const tabContents = content.querySelectorAll('.admin-tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        const tab = button.dataset.tab;
        tabContents.forEach(content => {
            if (content.dataset.tabContent === tab) {
                content.style.display = 'block';
            } else {
                content.style.display = 'none';
            }
        });
        if (tab === 'audit') loadAuditLog();
    });
  });

  loadAdminUsers();
      loadAuditLog();
  loadAuditLog();
}

async function adminDeleteUser(targetUsername) {
  const confirmed = await showModal({
    title: "Delete User",
    body: `Are you sure you want to delete user "${targetUsername}"? This will remove all their data and cannot be undone.`,
    confirmText: "Delete User",
    confirmClass: "danger",
  });
  if (!confirmed) return;

  try {
    const token = localStorage.getItem("chatToken");
    const res = await fetch(`/api/admin/user/${targetUsername}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();

    if (data.success) {
      showModal({
        title: "Success",
        body: `User "${targetUsername}" has been deleted successfully.`,
      });
    } else {
      showModal({
        title: "Error",
        body: data.error || "Failed to delete user",
      });
    }
  } catch (err) {
    showModal({ title: "Error", body: "Error deleting user" });
  }
}

/* ---------- DIRECT MESSAGE FUNCTIONS ---------- */

function toggleDMPanel() {
  dmPanel.classList.toggle("active");
}

async function sendDM() {
  if (!dmInput.value.trim()) {
    await showModal({
      title: "Empty Message",
      body: "Please enter a message.",
    });
    return;
  }
  if (!currentDMUser) {
    await showModal({
      title: "No User Selected",
      body: "Please select a user from the list first.",
    });
    return;
  }
  socket.emit("send dm", { toUser: currentDMUser, message: dmInput.value });
  dmInput.value = "";
}

function startDM(user) {
  if (user === username) return;
  currentDMUser = user;
  dmPanel.classList.add("active");
  selectDMUser(user);
}

function selectDMUser(user) {
  currentDMUser = user;
  document
    .querySelectorAll("#dm-list li")
    .forEach((li) => li.classList.remove("active"));

  const userLi = Array.from(dmList.children).find(
    (li) => li.textContent === user,
  );
  if (userLi) userLi.classList.add("active");

  let msgArea = document.getElementById("dm-messages");
  if (!msgArea) {
    msgArea = document.createElement("ul");
    msgArea.id = "dm-messages";
    dmPanel.insertBefore(msgArea, dmPanel.lastElementChild);
  }
  msgArea.innerHTML = "";

  socket.emit("get dm history", { withUser: user });

  if (dmConversations[user]) {
    dmConversations[user].forEach((msg) => displayDMMessage(msg));
  }
}

function displayDMMessage(data) {
  const msgArea = document.getElementById("dm-messages");
  if (!msgArea) return;

  const li = document.createElement("li");
  li.className = "dm-message";
  if (data.from === username) li.classList.add("self");

  const fromDiv = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = data.fromDisplayName || data.from;
  fromDiv.appendChild(strong);

  const msgDiv = document.createElement("div");
  msgDiv.textContent = data.message;

  const timeDiv = document.createElement("div");
  timeDiv.style.fontSize = "11px";
  timeDiv.style.color = "var(--muted)";
  timeDiv.textContent = new Date(data.timestamp).toLocaleTimeString();

  li.appendChild(fromDiv);
  li.appendChild(msgDiv);
  li.appendChild(timeDiv);

  msgArea.appendChild(li);
  msgArea.scrollTop = msgArea.scrollHeight;
}

function updateDMList() {
  dmList.innerHTML = "";
  Object.keys(dmConversations).forEach((user) => {
    const li = document.createElement("li");
    li.textContent = user;
    li.onclick = () => selectDMUser(user);
    dmList.appendChild(li);
  });
}

/* ---------- SEARCH FUNCTIONS ---------- */

function openSearchModal() {
  searchModal.classList.add("visible");
}

function closeSearchModal() {
  searchModal.classList.remove("visible");
}

async function performSearch(query) {
  if (!query || !query.trim()) return;

  try {
    const token = localStorage.getItem("chatToken");
    const res = await fetch(`/api/messages/search?q=${encodeURIComponent(query)}&room=${encodeURIComponent(currentRoom)}`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    
    const results = await res.json();
    displaySearchResults(results);
    openSearchModal();
  } catch (err) {
    console.error("Search failed:", err);
  }
}

function displaySearchResults(results) {
  searchResultsList.innerHTML = "";
  if (results.length === 0) {
    searchResultsList.innerHTML = "<p>No results found.</p>";
    return;
  }

  results.forEach(msg => {
    const div = document.createElement("div");
    div.className = "message";
    div.style.marginBottom = "15px";
    div.style.padding = "10px";
    div.style.background = "var(--bg)";
    div.style.borderRadius = "8px";
    
    div.innerHTML = `
      <div class="meta">
        <strong>${msg.username}</strong> • ${new Date(msg.timestamp).toLocaleString()}
      </div>
      <div class="message-content">${msg.message}</div>
    `;
    searchResultsList.appendChild(div);
  });
}

/* ---------- PIN FUNCTIONS ---------- */

function pinMessage(messageId) {
    socket.emit("pin message", { messageId });
}

function unpinMessage(messageId) {
    socket.emit("unpin message", { messageId });
}

function togglePinnedList() {
    pinnedListModal.classList.toggle("visible");
}

function updatePinnedUI(pinnedMessages) {
    if (pinnedMessages && pinnedMessages.length > 0) {
        pinnedBar.style.display = "flex";
        pinnedSummary.textContent = `${pinnedMessages.length} pinned message${pinnedMessages.length === 1 ? '' : 's'}`;
        
        pinnedMessagesContainer.innerHTML = "";
        pinnedMessages.forEach(msg => {
            const div = document.createElement("div");
            div.style.cssText = "padding: 10px; background: var(--bg); border-radius: 6px; margin-bottom: 8px; border-left: 3px solid var(--accent);";
            div.innerHTML = `
                <div class="meta" style="display: flex; justify-content: space-between; align-items: center;">
                    <strong>${msg.username}</strong>
                    ${userRole === "admin" ? `<button onclick="unpinMessage(${msg.id})" style="background: none; border: none; color: #ff6b6b; cursor: pointer; font-size: 11px;">Unpin</button>` : ""}
                </div>
                <div style="font-size: 13px; margin-top: 4px;">${msg.message}</div>
            `;
            pinnedMessagesContainer.appendChild(div);
        });
    } else {
        pinnedBar.style.display = "none";
        pinnedMessagesContainer.innerHTML = "<p>No pinned messages.</p>";
    }
}

/* ---------- MENTION FUNCTIONS ---------- */

function showMentions(users) {
  if (users.length === 0) {
    hideMentions();
    return;
  }
  mentionsContainer.innerHTML = "";
  const list = document.createElement("div");
  list.id = "mentions-list";

  users.forEach((user, index) => {
    const item = document.createElement("div");
    item.className = "mention-item";
    if (index === selectedMentionIndex) {
      item.classList.add("selected");
    }
    item.textContent = user;
    item.onclick = () => selectMention(user);
    list.appendChild(item);
  });

  mentionsContainer.appendChild(list);
  list.style.display = "block";
}

function hideMentions() {
  const list = document.getElementById("mentions-list");
  if (list) {
    list.style.display = "none";
  }
  isMentioning = false;
}

function selectMention(selectedUser) {
  const cursorPosition = input.selectionStart;
  let textBeforeCursor = input.value.substring(0, cursorPosition);
  let wordsBeforeCursor = textBeforeCursor.split(/\s/);
  let lastWord = wordsBeforeCursor[wordsBeforeCursor.length - 1];
  
  if (lastWord.startsWith("@")) {
    wordsBeforeCursor[wordsBeforeCursor.length - 1] = `@${selectedUser} `;
    let newTextBeforeCursor = wordsBeforeCursor.join(" ");
    input.value = newTextBeforeCursor + input.value.substring(cursorPosition);
    input.setSelectionRange(newTextBeforeCursor.length, newTextBeforeCursor.length);
  }
  
  hideMentions();
  input.focus();
}

/* ---------- THEME FUNCTIONS ---------- */

function toggleTheme() {
    const isLight = document.body.classList.toggle("light-mode");
    localStorage.setItem("theme", isLight ? "light" : "dark");
    themeToggle.textContent = isLight ? "☀️" : "🌙";
}

/* ---------- SOCKET LISTENERS ---------- */

socket.on("connect", () => {
  if (isLoggedIn) {
    socket.emit("joinRoom", { username, room: currentRoom });
  }
});

socket.on("connect_error", (err) => {
  console.warn("Socket connect error:", err && err.message);
  if (err && (err.message === "Invalid token" || err.message === "No token")) {
    localStorage.removeItem("chatToken");
    isLoggedIn = false;
    userRole = "user";
    try {
      showAuthModal();
    } catch (e) {
      console.error(e);
    }
  }
});

socket.on("banned", ({ reason }) => {
  showModal({ title: "You have been banned", body: `Reason: ${reason}` });
});

socket.on("kicked", ({ reason }) => {
  showModal({ title: "You have been kicked", body: `Reason: ${reason}` });
});

socket.on('thread history', ({parent_message_id, messages}) => {
    if (parent_message_id === currentThreadId) {
        renderThreadView(parent_message_id, messages);
    }
});

socket.on('thread message', (data) => {
    if (data.parent_message_id === currentThreadId) {
        const threadMessages = document.getElementById("thread-messages");
        const li = document.createElement("li");
        li.className = "message";
        li.id = `thread-msg-${data.id}`;

        let avatarHtml = '';
        if (data.profilePicture) {
            avatarHtml = `<div class="avatar" style="background-image: url('${data.profilePicture}'); background-size: cover;"></div>`;
        } else {
            avatarHtml = `<div class="avatar" style="background-color:${data.userColor}">${(data.displayName || data.username)[0].toUpperCase()}</div>`;
        }

        li.innerHTML = `
                ${avatarHtml}
                <div class="bubble">
                    <div class="meta">
                        <span class="message-username">${data.displayName || data.username}</span> • ${new Date(data.timestamp).toLocaleTimeString()}
                    </div>
                    <div class="message-content">${data.message}</div>
                </div>
            `;
        threadMessages.appendChild(li);
        threadMessages.scrollTop = threadMessages.scrollHeight;
    }
});

socket.on('reply count updated', ({messageId, reply_count}) => {
    const replyLink = document.getElementById(`reply-link-${messageId}`);
    if(replyLink) {
        replyLink.textContent = `${reply_count} ${reply_count === 1 ? 'reply' : 'replies'}`;
    }
});

socket.on("custom rooms", (rooms) => {
    customRoomsList.innerHTML = "";
    rooms.sort((a, b) => a.name.localeCompare(b.name));
    rooms.forEach(room => addRoomToList(room.name, room.isPrivate));
    
    // Ensure 'general' is active by default if no other room is active
    if (!document.querySelector('.room.active')) {
        const generalRoomEl = document.querySelector('.room[data-room="general"]');
        if (generalRoomEl) {
            generalRoomEl.classList.add('active');
        }
    }
});

socket.on("new room", ({ name, isPrivate }) => {
    addRoomToList(name, isPrivate);
    // Re-sort the list
    const rooms = Array.from(customRoomsList.children);
    rooms.sort((a, b) => a.dataset.room.localeCompare(b.dataset.room));
    rooms.forEach(room => customRoomsList.appendChild(room));
});

socket.on("room deleted", ({ name }) => {
    const el = document.querySelector(`.room[data-room="${name}"]`);
    if (el) el.remove();
    if (currentRoom === name) {
        const generalRoom = document.querySelector('.room[data-room="general"]');
        if (generalRoom) switchRoom('general', generalRoom);
    }
});

socket.on("join room error", ({ error, room }) => {
    showModal({ title: "Access Denied", body: error });
    switchRoom('general', document.querySelector('.room[data-room="general"]'));
});

socket.on("messageHistory", (history) => {
  const messageIds = history.filter((msg) => msg.id).map((msg) => msg.id);

  history.forEach((msg) => {
    displayMessage(msg);
  });

  if (messageIds.length > 0) {
    messageIds.forEach((messageId) => {
      socket.emit("get reactions", { messageId });
    });
  }
});

socket.on("userList", (users) => {
  currentUsers = users.map(u => u.username);
  userListUl.innerHTML = "";

  users.forEach(({ username: user, displayName, profilePicture, status }) => {
    const li = document.createElement("li");
    li.style.cursor = "pointer";

    const dot = document.createElement("span");
    dot.className = `status-dot ${status}`;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.style.width = '20px';
    avatar.style.height = '20px';
    avatar.style.fontSize = '10px';
    avatar.style.marginRight = '5px';

    if (profilePicture) {
      avatar.style.backgroundImage = `url('${profilePicture}')`;
      avatar.style.backgroundSize = 'cover';
      avatar.textContent = '';
    } else {
      avatar.textContent = (displayName || user)[0].toUpperCase();
      avatar.style.backgroundColor = generateUserColor(user);
    }
    
    const name = document.createElement("span");
    name.textContent = displayName || user;
    name.onclick = () => startDM(user);

    li.appendChild(dot);
    li.appendChild(avatar);
    li.appendChild(name);

    if (user === username) {
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "🗑️";
      deleteBtn.title = "Delete Account";
      deleteBtn.style.cssText = `
                margin-left: 5px;
                background: none;
                border: none;
                color: #ff6b6b;
                cursor: pointer;
                font-size: 12px;
                opacity: 0.7;
            `;
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteAccount();
      };
      deleteBtn.onmouseover = () => (deleteBtn.style.opacity = "1");
      deleteBtn.onmouseout = () => (deleteBtn.style.opacity = "0.7");
      li.appendChild(deleteBtn);
    }

    if (userRole === "admin" && user !== username) {
      const adminDeleteBtn = document.createElement("button");
      adminDeleteBtn.textContent = "⚡";
      adminDeleteBtn.title = `Delete User ${user}`;
      adminDeleteBtn.style.cssText = `
                margin-left: 5px;
                background: none;
                border: none;
                color: #ffa500;
                cursor: pointer;
                font-size: 12px;
                opacity: 0.7;
            `;
      adminDeleteBtn.onclick = (e) => {
        e.stopPropagation();
        adminDeleteUser(user);
      };
      adminDeleteBtn.onmouseover = () => (adminDeleteBtn.style.opacity = "1");
      adminDeleteBtn.onmouseout = () => (adminDeleteBtn.style.opacity = "0.7");
      li.appendChild(adminDeleteBtn);
    }

    userListUl.appendChild(li);
  });

  const typingUsers = users
    .filter((u) => u.status === "typing" && u.user !== username)
    .map((u) => u.user);

  if (typingUsers.length > 0) {
    if (typingUsers.length === 1) {
      typingIndicator.textContent = `${typingUsers[0]} is typing...`;
    } else if (typingUsers.length === 2) {
      typingIndicator.textContent = `${typingUsers.join(" and ")} are typing...`;
    } else {
      typingIndicator.textContent = "Several people are typing...";
    }
  } else {
    typingIndicator.textContent = "";
  }
});

socket.on("chat message", (data) => {
  displayMessage(data);
});

socket.on("message edited", ({ id, message, edited }) => {
  const msgEl = document.getElementById(`msg-${id}`);
  if (msgEl) {
    const content = msgEl.querySelector(".message-content");
    const meta = msgEl.querySelector(".meta");
    if (content) content.textContent = message;
    if (meta)
      meta.innerHTML = meta.innerHTML.replace(" (edited)", "") + " (edited)";
  }
});

socket.on("message deleted", ({ id }) => {
  const msgEl = document.getElementById(`msg-${id}`);
  if (msgEl) msgEl.remove();
});

socket.on("reactions updated", ({ messageId, reactions }) => {
  updateReactions(messageId, reactions);
});

socket.on("receive dm", (data) => {
  const key = data.from === username ? data.to : data.from;
  if (!dmConversations[key]) dmConversations[key] = [];
  dmConversations[key].push(data);

  if (currentDMUser === key) {
    displayDMMessage(data);
  }
  updateDMList();
});

socket.on("dm history", ({ withUser, messages }) => {
  dmConversations[withUser] = messages;
  if (currentDMUser === withUser) {
    // Rerender the conversation with the history
    let msgArea = document.getElementById("dm-messages");
    if (msgArea) {
      msgArea.innerHTML = "";
      messages.forEach((msg) => displayDMMessage(msg));
    }
  }
  // Ensure the user appears in the DM list
  if (!Object.keys(dmConversations).includes(withUser)) {
      updateDMList();
  }
});

socket.on("pinned messages", (pinnedMessages) => {
    updatePinnedUI(pinnedMessages);
});

socket.on("pinned messages updated", (pinnedMessages) => {
    updatePinnedUI(pinnedMessages);
});

/* ---------- EVENT LISTENERS ---------- */

emojiInputBtn.addEventListener("click", () => {
    emojiInputPickerContainer.classList.toggle("active");
});

inputEmojiPicker.addEventListener('emoji-click', event => {
    const emoji = event.detail.unicode;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;
    input.value = text.substring(0, start) + emoji + text.substring(end);
    input.focus();
    input.setSelectionRange(start + emoji.length, start + emoji.length);
    emojiInputPickerContainer.classList.remove("active");
});

document.addEventListener("click", (e) => {
    if (emojiInputPickerContainer && !emojiInputPickerContainer.contains(e.target) && e.target !== emojiInputBtn) {
        emojiInputPickerContainer.classList.remove("active");
    }
});

uploadBtn.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (data.filePath) {
      socket.emit("sendMessage", { message: data.filePath, roomId: currentRoom, parentMessageId: null });
    } else {
      showModal({
        title: "Upload Error",
        body: data.error || "Failed to upload file.",
      });
    }
  } catch (err) {
    showModal({ title: "Upload Error", body: "An unexpected error occurred." });
  }

  fileInput.value = "";
});

input.addEventListener("input", () => {
    const cursorPosition = input.selectionStart;
    const textBeforeCursor = input.value.substring(0, cursorPosition);
    const match = textBeforeCursor.match(/@(\w*)$/);
    
    if (match) {
        isMentioning = true;
        mentionQuery = match[1];
        const filteredUsers = currentUsers.filter(u => u.toLowerCase().startsWith(mentionQuery.toLowerCase()) && u !== username);
        showMentions(filteredUsers);
    } else {
        hideMentions();
    }
});

input.addEventListener("keydown", (e) => {
    if (isMentioning && document.getElementById("mentions-list")) {
        const items = document.querySelectorAll('.mention-item');
        if (items.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            selectedMentionIndex = (selectedMentionIndex + 1) % items.length;
            showMentions(currentUsers.filter(u => u.toLowerCase().startsWith(mentionQuery.toLowerCase()) && u !== username));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectedMentionIndex = (selectedMentionIndex - 1 + items.length) % items.length;
            showMentions(currentUsers.filter(u => u.toLowerCase().startsWith(mentionQuery.toLowerCase()) && u !== username));
        } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            selectMention(items[selectedMentionIndex].textContent);
        } else if (e.key === "Escape") {
            hideMentions();
        }
    }
});

messages.addEventListener("click", (e) => {
  if (e.target.classList.contains("btn-react")) {
    e.preventDefault();
    e.stopPropagation();
    const messageId = parseInt(e.target.dataset.msgId);
    showEmojiPicker(messageId, e);
  } else if (e.target.classList.contains("btn-edit")) {
    e.preventDefault();
    e.stopPropagation();
    const messageId = parseInt(e.target.dataset.msgId);
    editMessage(messageId);
  } else if (e.target.classList.contains("btn-delete")) {
    e.preventDefault();
    e.stopPropagation();
    const messageId = parseInt(e.target.dataset.msgId);
    deleteMessage(messageId);
  } else if (e.target.classList.contains("btn-admin-delete")) {
    e.preventDefault();
    e.stopPropagation();
    const messageId = parseInt(e.target.dataset.msgId);
    adminDeleteMessage(messageId);
  } else if (e.target.classList.contains("message-username")) {
    e.preventDefault();
    e.stopPropagation();
    const targetUsername = e.target.textContent.trim();
    showUserProfileModal(targetUsername);
  }
});

document.addEventListener("click", (e) => {
  if (
    e.target.closest("#userList") &&
    e.target.tagName === "SPAN" &&
    !e.target.classList.contains("status-dot")
  ) {
    const user = e.target.textContent.trim();
    if (user && user !== " " && user !== "") {
      showUserProfileModal(user);
    }
  }
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    performSearch(searchInput.value);
  }
});

input.addEventListener("input", () => {
  socket.emit("typing");
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

dmInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendDM();
  }
});

adminBtn.addEventListener("click", showAdminPanel);

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    performSearch(searchInput.value);
  }
});

/* ---------- ENTRY POINT ---------- */

(function loadTheme() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
        document.body.classList.add("light-mode");
        if (themeToggle) themeToggle.textContent = "☀️";
    }
})();

(function tryAutoLogin() {
  const token = localStorage.getItem("chatToken");
  if (!token) return showAuthModal();

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload && payload.username) {
      // Set local state but DO NOT enable privileged UI until socket connects
      username = payload.username;
      userRole = payload.role || "user";
      socket.auth = { token };
      
      // Wait for socket connection success before enabling UI
      socket.once("connect", () => {
        isLoggedIn = true;
        // Show admin button only after successful socket auth
        if (userRole === "admin" && adminBtn) {
          adminBtn.style.display = "block";
        }
        if (profileBtn) profileBtn.style.display = "block";
        socket.emit("joinRoom", { username, room: currentRoom });
        loadUserBackground();
      });
      
      socket.connect();
      return;
    }
  } catch (e) {
    localStorage.removeItem("chatToken");
  }

  showAuthModal();
})();
