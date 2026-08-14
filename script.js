// ===================================================================
// PulseChat — script.js
// Vanilla JS + Supabase (auth, database, realtime, storage)
// ===================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---- Supabase config -------------------------------------------------
// Anon key is safe to expose client-side; Row Level Security enforces access.
const SUPABASE_URL = 'https://jhqhtdmifvvaaexdonco.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpocWh0ZG1pZnZ2YWFleGRvbmNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2OTU2OTAsImV4cCI6MjEwMjI3MTY5MH0.7BMEQpInwB7c1jqDgESHfanW_FMRSuyYF_4DxEqFxAw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CHAT_COLORS = ['#B497FF', '#C6FF33', '#7DD3FC', '#FF9DCF', '#FFB454', '#8FF7C0'];
const REACTION_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const PAGE_SIZE = 50;

// ---- DOM shortcuts -----------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const el = {
  authScreen: $('#authScreen'),
  mainApp: $('#mainApp'),
  loginForm: $('#loginForm'),
  registerForm: $('#registerForm'),
  loginError: $('#loginError'),
  registerError: $('#registerError'),
  authTabs: $$('.auth-tab'),

  myAvatar: $('#myAvatar'),
  myName: $('#myName'),
  installBtn: $('#installBtn'),
  installMenuItem: $('#installMenuItem'),
  menuBtn: $('#menuBtn'),
  menuDropdown: $('#menuDropdown'),

  searchConversations: $('#searchConversations'),
  newChatBtn: $('#newChatBtn'),
  conversationList: $('#conversationList'),
  emptyConversations: $('#emptyConversations'),

  appShell: $('#mainApp'),
  emptyState: $('#emptyState'),
  chatView: $('#chatView'),
  backToListBtn: $('#backToListBtn'),
  chatAvatar: $('#chatAvatar'),
  chatHeaderName: $('#chatHeaderName'),
  chatHeaderStatus: $('#chatHeaderStatus'),
  chatHeaderIdentity: $('#chatHeaderIdentity'),
  detailsToggleBtn: $('#detailsToggleBtn'),
  messagesEl: $('#messagesEl'),
  typingIndicator: $('#typingIndicator'),
  typingText: $('#typingText'),

  replyPreview: $('#replyPreview'),
  replyPreviewName: $('#replyPreviewName'),
  replyPreviewText: $('#replyPreviewText'),
  cancelReplyBtn: $('#cancelReplyBtn'),

  composerForm: $('#composerForm'),
  messageInput: $('#messageInput'),
  attachBtn: $('#attachBtn'),
  attachmentInput: $('#attachmentInput'),
  attachmentChip: $('#attachmentChip'),
  attachmentChipName: $('#attachmentChipName'),
  clearAttachmentBtn: $('#clearAttachmentBtn'),
  sendBtn: $('#sendBtn'),

  detailsPanel: $('#detailsPanel'),
  closeDetailsBtn: $('#closeDetailsBtn'),
  detailsAvatar: $('#detailsAvatar'),
  detailsName: $('#detailsName'),
  detailsSub: $('#detailsSub'),
  nicknameInput: $('#nicknameInput'),
  colorChips: $('#colorChips'),
  membersSection: $('#membersSection'),
  membersList: $('#membersList'),

  newChatModal: $('#newChatModal'),
  closeNewChatBtn: $('#closeNewChatBtn'),
  userSearchInput: $('#userSearchInput'),
  userResults: $('#userResults'),
  selectedUsers: $('#selectedUsers'),
  groupNameField: $('#groupNameField'),
  groupNameInput: $('#groupNameInput'),
  createChatBtn: $('#createChatBtn'),

  editProfileModal: $('#editProfileModal'),
  closeEditProfileBtn: $('#closeEditProfileBtn'),
  editAvatarPreview: $('#editAvatarPreview'),
  avatarInput: $('#avatarInput'),
  editFullName: $('#editFullName'),
  editPhone: $('#editPhone'),
  editProfileError: $('#editProfileError'),
  saveProfileBtn: $('#saveProfileBtn'),

  toastContainer: $('#toastContainer'),
};

// ---- App state -----------------------------------------------------
const state = {
  user: null,
  profile: null,
  conversations: new Map(),   // id -> conversation object
  profilesCache: new Map(),   // user_id -> profile
  activeConversationId: null,
  messagesCache: new Map(),   // conversation_id -> array of message rows (loaded window)
  oldestLoaded: new Map(),    // conversation_id -> ISO string of oldest loaded message
  onlineUsers: new Set(),
  selectedUserIds: new Set(), // for new chat modal
  pendingAttachment: null,
  replyTarget: null,
  typingChannel: null,
  typingTimeout: null,
  othersTypingTimeout: null,
  deferredInstallPrompt: null,
};

// =====================================================================
// Utilities
// =====================================================================

function toast(message, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type ? 'is-' + type : ''}`;
  t.textContent = message;
  el.toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function initialsOf(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const chars = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return chars.toUpperCase();
}

function applyAvatar(elNode, { avatarUrl, name }) {
  elNode.setAttribute('data-initials', initialsOf(name));
  if (avatarUrl) {
    elNode.style.backgroundImage = `url("${avatarUrl}")`;
  } else {
    elNode.style.backgroundImage = '';
  }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function formatClock(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDateSeparator(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

function relativeConversationTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return formatClock(iso);
  const diffDays = Math.round((now - d) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function closeAllModals() {
  el.newChatModal.hidden = true;
  el.editProfileModal.hidden = true;
}

// =====================================================================
// Auth
// =====================================================================

el.authTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    el.authTabs.forEach(t => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
    tab.classList.add('is-active');
    tab.setAttribute('aria-selected', 'true');
    const isLogin = tab.dataset.tab === 'login';
    el.loginForm.hidden = !isLogin;
    el.registerForm.hidden = isLogin;
  });
});

el.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  el.loginError.hidden = true;
  const fd = new FormData(el.loginForm);
  const email = fd.get('email').trim();
  const password = fd.get('password');
  const submitBtn = el.loginForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  } catch (err) {
    el.loginError.textContent = err.message || 'Could not log in. Check your details.';
    el.loginError.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

el.registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  el.registerError.hidden = true;
  const fd = new FormData(el.registerForm);
  const fullName = fd.get('fullName').trim();
  const email = fd.get('email').trim();
  const phone = fd.get('phone').trim();
  const password = fd.get('password');
  const submitBtn = el.registerForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone } },
    });
    if (error) throw error;
    toast('Account created — welcome!', 'success');
  } catch (err) {
    el.registerError.textContent = err.message || 'Could not create your account.';
    el.registerError.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

async function logout() {
  await supabase.auth.signOut();
}

// =====================================================================
// Boot / session handling
// =====================================================================

supabase.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    if (state.user?.id !== session.user.id) {
      state.user = session.user;
      bootApp();
    }
  } else {
    const wasSignedIn = !!state.user;
    state.user = null;
    state.profile = null;
    state.activeConversationId = null;
    el.authScreen.hidden = false;
    el.mainApp.hidden = true;
    closeAllModals();
    el.menuDropdown.hidden = true;
    if (wasSignedIn) toast('Your session ended — please log in again.', 'error');
  }
});

async function bootApp() {
  el.authScreen.hidden = true;
  el.mainApp.hidden = false;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', state.user.id)
    .maybeSingle();

  if (error || !profile) {
    // profile row created by DB trigger — brief retry in case of timing race
    await new Promise(r => setTimeout(r, 700));
    const retry = await supabase.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
    state.profile = retry.data;
  } else {
    state.profile = profile;
  }

  if (!state.profile) {
    toast('Could not load your profile. Try refreshing.', 'error');
    return;
  }

  renderMyProfile();
  await supabase.from('profiles').update({ status: 'online', last_seen: new Date().toISOString() }).eq('id', state.user.id);
  await loadConversations();
  subscribeGlobalRealtime();
  subscribePresence();
}

function renderMyProfile() {
  el.myName.textContent = state.profile.full_name || state.profile.email;
  applyAvatar(el.myAvatar, { avatarUrl: state.profile.avatar_url, name: state.profile.full_name });
}

window.addEventListener('beforeunload', () => {
  if (state.user) {
    navigator.sendBeacon?.(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${state.user.id}`,
    );
  }
});

// =====================================================================
// Menu / logout / profile editing
// =====================================================================

el.menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  el.menuDropdown.hidden = !el.menuDropdown.hidden;
});
document.addEventListener('click', () => { el.menuDropdown.hidden = true; });

el.menuDropdown.addEventListener('click', async (e) => {
  const action = e.target.dataset.action;
  if (action === 'logout') {
    await logout();
  } else if (action === 'edit-profile') {
    openEditProfile();
  } else if (action === 'install') {
    triggerInstall();
  }
});

$('#myAvatarBtn').addEventListener('click', openEditProfile);

function openEditProfile() {
  el.menuDropdown.hidden = true;
  if (!state.user || !state.profile) {
    toast('Your session ended — please log in again.', 'error');
    return;
  }
  el.editProfileError.hidden = true;
  el.editFullName.value = state.profile.full_name || '';
  el.editPhone.value = state.profile.phone || '';
  applyAvatar(el.editAvatarPreview, { avatarUrl: state.profile.avatar_url, name: state.profile.full_name });
  el.editProfileModal.hidden = false;
}
el.closeEditProfileBtn.addEventListener('click', () => (el.editProfileModal.hidden = true));

el.avatarInput.addEventListener('change', () => {
  const file = el.avatarInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    el.editAvatarPreview.style.backgroundImage = `url("${reader.result}")`;
  };
  reader.readAsDataURL(file);
});

el.saveProfileBtn.addEventListener('click', async () => {
  el.editProfileError.hidden = true;
  el.saveProfileBtn.disabled = true;
  try {
    // Session may have quietly dropped (e.g. the OS killed a background tab
    // while a native picker was open) while this modal stayed open. Try a
    // one-time self-heal before giving up.
    if (!state.user) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) state.user = session.user;
    }
    if (!state.user) {
      throw new Error('Your session ended — please log in again.');
    }
    if (!state.profile) {
      const { data: freshProfile } = await supabase.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
      state.profile = freshProfile || null;
    }
    if (!state.profile) {
      throw new Error('Could not load your profile — please refresh and try again.');
    }

    let avatarUrl = state.profile.avatar_url;
    const file = el.avatarInput.files[0];
    if (file) {
      const ext = file.name.split('.').pop();
      const path = `${state.user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      avatarUrl = `${pub.publicUrl}?t=${Date.now()}`;
    }
    const fullName = el.editFullName.value.trim();
    const phone = el.editPhone.value.trim();
    const { error } = await supabase.from('profiles')
      .update({ full_name: fullName, phone, avatar_url: avatarUrl })
      .eq('id', state.user.id);
    if (error) throw error;
    state.profile = { ...state.profile, full_name: fullName, phone, avatar_url: avatarUrl };
    renderMyProfile();
    el.editProfileModal.hidden = true;
    toast('Profile updated', 'success');
  } catch (err) {
    el.editProfileError.textContent = err.message || 'Could not save changes.';
    el.editProfileError.hidden = false;
  } finally {
    el.saveProfileBtn.disabled = false;
  }
});

// =====================================================================
// Conversations — load & render
// =====================================================================

async function loadConversations() {
  const { data: rows, error } = await supabase
    .from('conversation_participants')
    .select('conversation_id, nickname, theme_color, last_read_at, conversations(id, is_group, name, avatar_url, created_by, created_at)')
    .eq('user_id', state.user.id);

  if (error) { toast('Could not load chats', 'error'); return; }

  state.conversations.clear();

  for (const row of rows) {
    const conv = row.conversations;
    if (!conv) continue;
    state.conversations.set(conv.id, {
      ...conv,
      myNickname: row.nickname,
      myThemeColor: row.theme_color || CHAT_COLORS[0],
      myLastReadAt: row.last_read_at,
      participants: [],
      lastMessage: null,
      unreadCount: 0,
    });
  }

  const convIds = Array.from(state.conversations.keys());
  if (convIds.length === 0) {
    renderConversationList();
    return;
  }

  // participants (with profiles) for every conversation the user's in
  const { data: allParticipants } = await supabase
    .from('conversation_participants')
    .select('conversation_id, user_id, nickname, theme_color, profiles(id, full_name, email, avatar_url, status, last_seen)')
    .in('conversation_id', convIds);

  for (const p of allParticipants || []) {
    const conv = state.conversations.get(p.conversation_id);
    if (!conv) continue;
    conv.participants.push(p);
    if (p.profiles) state.profilesCache.set(p.user_id, p.profiles);
  }

  // last message + unread count per conversation
  await Promise.all(convIds.map(async (id) => {
    const conv = state.conversations.get(id);
    const { data: lastMsgs } = await supabase
      .from('messages')
      .select('id, sender_id, content, attachment_type, created_at, deleted')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(1);
    conv.lastMessage = lastMsgs?.[0] || null;

    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', id)
      .neq('sender_id', state.user.id)
      .gt('created_at', conv.myLastReadAt || '1970-01-01');
    conv.unreadCount = count || 0;
  }));

  renderConversationList();
}

function getOtherParticipant(conv) {
  return conv.participants.find(p => p.user_id !== state.user.id) || null;
}

function getConversationDisplay(conv) {
  if (conv.is_group) {
    return {
      name: conv.name || 'Group chat',
      avatarUrl: conv.avatar_url,
      isOnline: false,
      statusText: `${conv.participants.length} members`,
      otherUserId: null,
    };
  }
  const other = getOtherParticipant(conv);
  const profile = other ? state.profilesCache.get(other.user_id) : null;
  const nickname = conv.myNickname;
  const isOnline = other ? state.onlineUsers.has(other.user_id) : false;
  return {
    name: nickname || profile?.full_name || profile?.email || 'Unknown',
    avatarUrl: profile?.avatar_url || null,
    isOnline,
    statusText: isOnline ? 'Online' : (profile?.last_seen ? `Last seen ${relativeConversationTime(profile.last_seen)}` : 'Offline'),
    otherUserId: other?.user_id || null,
  };
}

function conversationPreviewText(conv) {
  const msg = conv.lastMessage;
  if (!msg) return 'Say hi 👋';
  if (msg.deleted) return 'Message deleted';
  const prefix = msg.sender_id === state.user.id ? 'You: ' : '';
  if (msg.attachment_type) return `${prefix}📷 Photo`;
  return `${prefix}${msg.content || ''}`;
}

function renderConversationList() {
  const query = el.searchConversations.value.trim().toLowerCase();
  const list = Array.from(state.conversations.values()).sort((a, b) => {
    const ta = a.lastMessage?.created_at || a.created_at;
    const tb = b.lastMessage?.created_at || b.created_at;
    return new Date(tb) - new Date(ta);
  });

  el.conversationList.innerHTML = '';
  let visibleCount = 0;

  for (const conv of list) {
    const display = getConversationDisplay(conv);
    if (query && !display.name.toLowerCase().includes(query)) continue;
    visibleCount++;

    const li = document.createElement('li');
    li.className = 'conversation-item' + (conv.id === state.activeConversationId ? ' is-active' : '') + (conv.unreadCount > 0 ? ' has-unread' : '');
    li.dataset.id = conv.id;

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar-wrap';
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    applyAvatar(avatar, { avatarUrl: display.avatarUrl, name: display.name });
    avatarWrap.appendChild(avatar);
    if (display.isOnline) {
      const dot = document.createElement('span');
      dot.className = 'status-dot is-online';
      avatarWrap.appendChild(dot);
    }

    const meta = document.createElement('div');
    meta.className = 'conversation-meta';
    meta.innerHTML = `
      <div class="conversation-top-row">
        <span class="conversation-name">${escapeHtml(display.name)}</span>
        <span class="conversation-time">${relativeConversationTime(conv.lastMessage?.created_at || conv.created_at)}</span>
      </div>
      <div class="conversation-preview">
        <span>${escapeHtml(conversationPreviewText(conv))}</span>
      </div>
    `;
    if (conv.unreadCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'unread-badge';
      badge.textContent = conv.unreadCount > 9 ? '9+' : conv.unreadCount;
      meta.querySelector('.conversation-preview').appendChild(badge);
    }

    li.appendChild(avatarWrap);
    li.appendChild(meta);
    li.addEventListener('click', () => openConversation(conv.id));
    el.conversationList.appendChild(li);
  }

  el.emptyConversations.hidden = visibleCount > 0;
}

el.searchConversations.addEventListener('input', renderConversationList);

// =====================================================================
// Opening a conversation & rendering messages
// =====================================================================

async function openConversation(id) {
  state.activeConversationId = id;
  const conv = state.conversations.get(id);
  if (!conv) return;

  el.appShell.classList.add('view-chat');
  el.appShell.classList.remove('view-list', 'view-details');
  el.emptyState.hidden = true;
  el.chatView.hidden = false;
  clearReplyTarget();
  el.attachmentChip.hidden = true;
  state.pendingAttachment = null;
  el.messageInput.value = '';

  renderChatHeader(conv);
  renderConversationList();

  if (!state.messagesCache.has(id)) {
    await loadMessages(id);
  } else {
    renderMessages(id);
  }

  await markConversationRead(id);
  subscribeTyping(id);
  scrollMessagesToBottom();
}

function renderChatHeader(conv) {
  const display = getConversationDisplay(conv);
  applyAvatar(el.chatAvatar, { avatarUrl: display.avatarUrl, name: display.name });
  el.chatHeaderName.textContent = display.name;
  el.chatHeaderStatus.textContent = display.statusText;
  el.chatHeaderStatus.classList.toggle('is-online', display.isOnline);
  renderDetailsPanel(conv);
}

async function loadMessages(convId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (error) { toast('Could not load messages', 'error'); return; }

  const ordered = (data || []).slice().reverse();
  state.messagesCache.set(convId, ordered);
  state.oldestLoaded.set(convId, ordered[0]?.created_at || null);

  // hydrate reactions for this window
  await hydrateReactions(convId, ordered.map(m => m.id));

  renderMessages(convId);
}

async function hydrateReactions(convId, messageIds) {
  if (!messageIds.length) return;
  const { data } = await supabase.from('message_reactions').select('*').in('message_id', messageIds);
  const byMessage = new Map();
  for (const r of data || []) {
    if (!byMessage.has(r.message_id)) byMessage.set(r.message_id, []);
    byMessage.get(r.message_id).push(r);
  }
  const msgs = state.messagesCache.get(convId) || [];
  for (const m of msgs) m._reactions = byMessage.get(m.id) || [];
}

async function loadOlderMessages(convId) {
  const oldest = state.oldestLoaded.get(convId);
  if (!oldest) return;
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', convId)
    .lt('created_at', oldest)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (!data || !data.length) return;
  const ordered = data.slice().reverse();
  await hydrateReactions(convId, ordered.map(m => m.id));
  const existing = state.messagesCache.get(convId) || [];
  state.messagesCache.set(convId, [...ordered, ...existing]);
  state.oldestLoaded.set(convId, ordered[0].created_at);

  const prevHeight = el.messagesEl.scrollHeight;
  renderMessages(convId);
  el.messagesEl.scrollTop = el.messagesEl.scrollHeight - prevHeight;
}

el.messagesEl.addEventListener('scroll', () => {
  if (el.messagesEl.scrollTop < 60 && state.activeConversationId) {
    loadOlderMessages(state.activeConversationId);
  }
});

function findMessageInCache(convId, id) {
  return (state.messagesCache.get(convId) || []).find(m => m.id === id);
}

function senderProfile(userId) {
  if (userId === state.user.id) return state.profile;
  return state.profilesCache.get(userId) || { full_name: 'Unknown' };
}

function renderMessages(convId) {
  const msgs = state.messagesCache.get(convId) || [];
  const conv = state.conversations.get(convId);
  el.messagesEl.innerHTML = '';
  el.messagesEl.style.setProperty('--conv-accent', conv?.myThemeColor || CHAT_COLORS[0]);

  let lastDate = null;
  let lastSender = null;

  msgs.forEach((m, idx) => {
    const dateLabel = formatDateSeparator(m.created_at);
    if (dateLabel !== lastDate) {
      const sep = document.createElement('div');
      sep.className = 'date-separator';
      sep.textContent = dateLabel;
      el.messagesEl.appendChild(sep);
      lastDate = dateLabel;
      lastSender = null;
    }

    const isMine = m.sender_id === state.user.id;
    const grouped = lastSender === m.sender_id;
    const nextMsg = msgs[idx + 1];
    const showAvatar = !isMine && (!nextMsg || nextMsg.sender_id !== m.sender_id || formatDateSeparator(nextMsg.created_at) !== dateLabel);

    el.messagesEl.appendChild(renderMessageRow(m, conv, { isMine, grouped, showAvatar }));
    lastSender = m.sender_id;
  });

  updateSeenIndicator(conv);
}

function renderMessageRow(m, conv, { isMine, grouped, showAvatar }) {
  const row = document.createElement('div');
  row.className = `msg-row ${isMine ? 'is-mine' : ''} ${grouped ? 'is-grouped' : ''} ${showAvatar ? 'show-avatar' : ''}`;
  row.dataset.id = m.id;

  const profile = senderProfile(m.sender_id);
  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  applyAvatar(avatar, { avatarUrl: profile.avatar_url, name: profile.full_name });
  row.appendChild(avatar);

  const col = document.createElement('div');
  col.style.display = 'flex';
  col.style.flexDirection = 'column';
  col.style.position = 'relative';

  const hoverActions = document.createElement('div');
  hoverActions.className = 'msg-hover-actions';
  if (!m.deleted) {
    hoverActions.innerHTML = `
      <button type="button" data-act="react" title="React">🙂</button>
      <button type="button" data-act="reply" title="Reply">↩</button>
      ${isMine ? '<button type="button" data-act="edit" title="Edit">✎</button><button type="button" data-act="delete" title="Delete">🗑</button>' : ''}
    `;
  }
  col.appendChild(hoverActions);

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble' + (m.deleted ? ' is-deleted' : '');

  if (m.deleted) {
    bubble.textContent = 'Message deleted';
  } else {
    if (m.reply_to_id) {
      const target = findMessageInCache(conv.id, m.reply_to_id);
      const quote = document.createElement('div');
      quote.className = 'msg-reply-quote';
      const targetName = target ? (target.sender_id === state.user.id ? 'You' : senderProfile(target.sender_id).full_name) : 'a message';
      const targetText = target ? (target.deleted ? 'Message deleted' : (target.content || (target.attachment_type ? 'Photo' : ''))) : 'Original message unavailable';
      quote.innerHTML = `<b>${escapeHtml(targetName)}</b><br>${escapeHtml(targetText).slice(0, 120)}`;
      bubble.appendChild(quote);
    }
    if (m.attachment_url) {
      const img = document.createElement('img');
      img.className = 'msg-attachment';
      img.src = m.attachment_url;
      img.alt = 'Attachment';
      img.loading = 'lazy';
      bubble.appendChild(img);
    }
    if (m.content) {
      const textNode = document.createElement('span');
      textNode.textContent = m.content;
      bubble.appendChild(textNode);
    }
  }
  col.appendChild(bubble);

  const metaRow = document.createElement('div');
  metaRow.className = 'msg-meta-row';
  let metaText = formatClock(m.created_at);
  if (m.edited_at && !m.deleted) metaText += ' · edited';
  metaRow.textContent = metaText;
  col.appendChild(metaRow);

  if (!m.deleted && m._reactions && m._reactions.length) {
    col.appendChild(renderReactions(m));
  }

  hoverActions.addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    if (act === 'reply') setReplyTarget(m);
    if (act === 'delete') deleteMessage(m);
    if (act === 'edit') startEditMessage(m, bubble);
    if (act === 'react') openReactionPicker(m, hoverActions);
  });

  row.appendChild(col);
  return row;
}

function renderReactions(m) {
  const wrap = document.createElement('div');
  wrap.className = 'msg-reactions';
  const counts = new Map();
  for (const r of m._reactions) {
    counts.set(r.emoji, (counts.get(r.emoji) || 0) + 1);
  }
  for (const [emoji, count] of counts) {
    const mine = m._reactions.some(r => r.emoji === emoji && r.user_id === state.user.id);
    const pill = document.createElement('span');
    pill.className = 'reaction-pill' + (mine ? ' is-mine' : '');
    pill.textContent = `${emoji} ${count > 1 ? count : ''}`.trim();
    wrap.appendChild(pill);
  }
  return wrap;
}

function scrollMessagesToBottom() {
  requestAnimationFrame(() => { el.messagesEl.scrollTop = el.messagesEl.scrollHeight; });
}

function updateSeenIndicator(conv) {
  if (!conv || conv.is_group) return;
  const msgs = state.messagesCache.get(conv.id) || [];
  const lastMine = [...msgs].reverse().find(m => m.sender_id === state.user.id);
  if (!lastMine) return;
  const other = getOtherParticipant(conv);
  if (!other) return;
  const row = el.messagesEl.querySelector(`[data-id="${lastMine.id}"] .msg-meta-row`);
  if (row && other.last_read_at && new Date(other.last_read_at) >= new Date(lastMine.created_at)) {
    if (!row.textContent.includes('Seen')) row.textContent += ' · Seen';
  }
}

async function markConversationRead(convId) {
  const nowIso = new Date().toISOString();
  await supabase.from('conversation_participants')
    .update({ last_read_at: nowIso })
    .eq('conversation_id', convId)
    .eq('user_id', state.user.id);
  const conv = state.conversations.get(convId);
  if (conv) { conv.myLastReadAt = nowIso; conv.unreadCount = 0; }
  renderConversationList();
}

// =====================================================================
// Reply / edit / delete / react
// =====================================================================

function setReplyTarget(m) {
  state.replyTarget = m;
  const profile = senderProfile(m.sender_id);
  el.replyPreviewName.textContent = m.sender_id === state.user.id ? 'yourself' : (profile.full_name || profile.email);
  el.replyPreviewText.textContent = m.deleted ? 'Message deleted' : (m.content || (m.attachment_type ? 'Photo' : ''));
  el.replyPreview.hidden = false;
  el.messageInput.focus();
}
function clearReplyTarget() {
  state.replyTarget = null;
  el.replyPreview.hidden = true;
}
el.cancelReplyBtn.addEventListener('click', clearReplyTarget);

async function deleteMessage(m) {
  if (!confirm('Delete this message?')) return;
  const { error } = await supabase.from('messages')
    .update({ deleted: true, content: null, attachment_url: null, attachment_type: null })
    .eq('id', m.id);
  if (error) { toast('Could not delete message', 'error'); return; }
  m.deleted = true;
  m.content = null;
  m.attachment_url = null;
  renderMessages(state.activeConversationId);
}

function startEditMessage(m, bubbleEl) {
  const original = m.content || '';
  bubbleEl.innerHTML = '';
  const textarea = document.createElement('textarea');
  textarea.value = original;
  textarea.style.cssText = 'width:100%;min-width:180px;background:transparent;border:none;outline:none;resize:none;font:inherit;color:inherit;';
  bubbleEl.appendChild(textarea);
  textarea.focus();
  textarea.setSelectionRange(original.length, original.length);

  const commit = async () => {
    const newText = textarea.value.trim();
    if (newText && newText !== original) {
      const { error } = await supabase.from('messages')
        .update({ content: newText, edited_at: new Date().toISOString() })
        .eq('id', m.id);
      if (!error) { m.content = newText; m.edited_at = new Date().toISOString(); }
    }
    renderMessages(state.activeConversationId);
  };
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { renderMessages(state.activeConversationId); }
  });
  textarea.addEventListener('blur', commit);
}

function openReactionPicker(m, anchorEl) {
  document.querySelectorAll('.reaction-picker').forEach(n => n.remove());
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  picker.style.cssText = 'position:absolute;top:-52px;left:0;display:flex;gap:4px;background:var(--surface-3);border:1px solid var(--border-strong);border-radius:20px;padding:5px 7px;box-shadow:var(--shadow-card);z-index:5;';
  REACTION_EMOJI.forEach(emoji => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = emoji;
    btn.style.cssText = 'font-size:16px;padding:2px 4px;';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleReaction(m, emoji);
      picker.remove();
    });
    picker.appendChild(btn);
  });
  anchorEl.appendChild(picker);
  setTimeout(() => {
    document.addEventListener('click', function onDoc(ev) {
      if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', onDoc); }
    });
  }, 0);
}

async function toggleReaction(m, emoji) {
  const mine = (m._reactions || []).filter(r => r.user_id === state.user.id);
  const already = mine.find(r => r.emoji === emoji);
  if (mine.length) {
    await supabase.from('message_reactions').delete().eq('message_id', m.id).eq('user_id', state.user.id);
  }
  m._reactions = (m._reactions || []).filter(r => r.user_id !== state.user.id);
  if (!already) {
    const { error } = await supabase.from('message_reactions').insert({ message_id: m.id, user_id: state.user.id, emoji });
    if (!error) m._reactions.push({ message_id: m.id, user_id: state.user.id, emoji });
  }
  renderMessages(state.activeConversationId);
}

// =====================================================================
// Composer — sending messages
// =====================================================================

el.messageInput.addEventListener('input', () => {
  el.messageInput.style.height = 'auto';
  el.messageInput.style.height = Math.min(el.messageInput.scrollHeight, 120) + 'px';
  broadcastTyping();
});

el.messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    el.composerForm.requestSubmit();
  }
});

el.attachBtn.addEventListener('click', () => el.attachmentInput.click());
el.attachmentInput.addEventListener('change', () => {
  const file = el.attachmentInput.files[0];
  if (!file) return;
  state.pendingAttachment = file;
  el.attachmentChipName.textContent = file.name;
  el.attachmentChip.hidden = false;
});
el.clearAttachmentBtn.addEventListener('click', () => {
  state.pendingAttachment = null;
  el.attachmentInput.value = '';
  el.attachmentChip.hidden = true;
});

el.composerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const convId = state.activeConversationId;
  if (!convId) return;
  if (!state.user) {
    toast('Your session ended — please log in again.', 'error');
    return;
  }
  const text = el.messageInput.value.trim();
  const file = state.pendingAttachment;
  if (!text && !file) return;

  el.sendBtn.disabled = true;
  try {
    let attachmentUrl = null, attachmentType = null;
    if (file) {
      const ext = file.name.split('.').pop();
      const path = `${state.user.id}/${convId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, file);
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('attachments').getPublicUrl(path);
      attachmentUrl = pub.publicUrl;
      attachmentType = file.type;
    }

    const payload = {
      conversation_id: convId,
      sender_id: state.user.id,
      content: text || null,
      attachment_url: attachmentUrl,
      attachment_type: attachmentType,
      reply_to_id: state.replyTarget?.id || null,
    };

    const { data: inserted, error } = await supabase.from('messages').insert(payload).select().single();
    if (error) throw error;

    const cache = state.messagesCache.get(convId) || [];
    cache.push({ ...inserted, _reactions: [] });
    state.messagesCache.set(convId, cache);
    const conv = state.conversations.get(convId);
    if (conv) conv.lastMessage = inserted;

    el.messageInput.value = '';
    el.messageInput.style.height = 'auto';
    state.pendingAttachment = null;
    el.attachmentInput.value = '';
    el.attachmentChip.hidden = true;
    clearReplyTarget();
    renderMessages(convId);
    renderConversationList();
    scrollMessagesToBottom();
    stopTyping();
  } catch (err) {
    toast(err.message || 'Could not send message', 'error');
  } finally {
    el.sendBtn.disabled = false;
  }
});

// =====================================================================
// Typing indicator (Realtime broadcast, per conversation)
// =====================================================================

function subscribeTyping(convId) {
  if (state.typingChannel) supabase.removeChannel(state.typingChannel);
  el.typingIndicator.hidden = true;

  const channel = supabase.channel(`typing-${convId}`, { config: { broadcast: { self: false } } });
  channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
    if (payload.user_id === state.user.id) return;
    const profile = state.profilesCache.get(payload.user_id);
    el.typingText.textContent = `${profile?.full_name || 'Someone'} is typing…`;
    el.typingIndicator.hidden = false;
    clearTimeout(state.othersTypingTimeout);
    state.othersTypingTimeout = setTimeout(() => { el.typingIndicator.hidden = true; }, 3000);
  });
  channel.subscribe();
  state.typingChannel = channel;
}

function broadcastTyping() {
  if (!state.typingChannel || !state.activeConversationId) return;
  state.typingChannel.send({ type: 'broadcast', event: 'typing', payload: { user_id: state.user.id } });
  clearTimeout(state.typingTimeout);
  state.typingTimeout = setTimeout(stopTyping, 2500);
}
function stopTyping() { clearTimeout(state.typingTimeout); }

// =====================================================================
// Global realtime — new messages, reactions, membership, presence
// =====================================================================

function subscribeGlobalRealtime() {
  supabase.channel('db-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, handleIncomingMessage)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, handleUpdatedMessage)
    .subscribe();

  supabase.channel('db-reactions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, handleReactionChange)
    .subscribe();

  supabase.channel('db-participants')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_participants' }, () => loadConversations())
    .subscribe();

  supabase.channel('db-profiles')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, ({ new: row }) => {
      state.profilesCache.set(row.id, row);
      if (state.activeConversationId) {
        const conv = state.conversations.get(state.activeConversationId);
        if (conv && !conv.is_group && getOtherParticipant(conv)?.user_id === row.id) {
          renderChatHeader(conv);
          updateSeenIndicator(conv);
        }
      }
      renderConversationList();
    })
    .subscribe();
}

function handleIncomingMessage({ new: m }) {
  if (!state.conversations.has(m.conversation_id)) return;
  const conv = state.conversations.get(m.conversation_id);
  conv.lastMessage = m;

  if (m.conversation_id === state.activeConversationId) {
    const cache = state.messagesCache.get(m.conversation_id) || [];
    if (!cache.some(x => x.id === m.id)) {
      cache.push({ ...m, _reactions: [] });
      state.messagesCache.set(m.conversation_id, cache);
      renderMessages(m.conversation_id);
      scrollMessagesToBottom();
      if (m.sender_id !== state.user.id) markConversationRead(m.conversation_id);
    }
  } else if (m.sender_id !== state.user.id) {
    conv.unreadCount = (conv.unreadCount || 0) + 1;
  }
  renderConversationList();
}

function handleUpdatedMessage({ new: m }) {
  const cache = state.messagesCache.get(m.conversation_id);
  if (cache) {
    const idx = cache.findIndex(x => x.id === m.id);
    if (idx > -1) cache[idx] = { ...cache[idx], ...m };
  }
  const conv = state.conversations.get(m.conversation_id);
  if (conv?.lastMessage?.id === m.id) conv.lastMessage = { ...conv.lastMessage, ...m };
  if (m.conversation_id === state.activeConversationId) renderMessages(m.conversation_id);
  renderConversationList();
}

function handleReactionChange() {
  if (!state.activeConversationId) return;
  const cache = state.messagesCache.get(state.activeConversationId);
  if (!cache) return;
  hydrateReactions(state.activeConversationId, cache.map(m => m.id)).then(() => {
    renderMessages(state.activeConversationId);
  });
}

function subscribePresence() {
  const channel = supabase.channel('presence-global', { config: { presence: { key: state.user.id } } });
  channel
    .on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState();
      state.onlineUsers = new Set(Object.keys(presenceState));
      renderConversationList();
      if (state.activeConversationId) {
        const conv = state.conversations.get(state.activeConversationId);
        if (conv) renderChatHeader(conv);
      }
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ user_id: state.user.id, online_at: new Date().toISOString() });
      }
    });
}

// =====================================================================
// New chat modal
// =====================================================================

el.newChatBtn.addEventListener('click', () => {
  state.selectedUserIds.clear();
  el.userSearchInput.value = '';
  el.userResults.innerHTML = '';
  el.selectedUsers.innerHTML = '';
  el.groupNameField.hidden = true;
  el.groupNameInput.value = '';
  el.createChatBtn.disabled = true;
  el.newChatModal.hidden = false;
  el.userSearchInput.focus();
});
el.closeNewChatBtn.addEventListener('click', () => (el.newChatModal.hidden = true));
el.newChatModal.addEventListener('click', (e) => { if (e.target === el.newChatModal) el.newChatModal.hidden = true; });

let userSearchDebounce;
el.userSearchInput.addEventListener('input', () => {
  clearTimeout(userSearchDebounce);
  userSearchDebounce = setTimeout(searchUsers, 280);
});

async function searchUsers() {
  const q = el.userSearchInput.value.trim();
  el.userResults.innerHTML = '';
  if (q.length < 2) return;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url')
    .ilike('email', `%${q}%`)
    .neq('id', state.user.id)
    .limit(10);
  if (error) return;
  for (const u of data || []) {
    state.profilesCache.set(u.id, { ...state.profilesCache.get(u.id), ...u });
    const li = document.createElement('li');
    li.className = 'user-result' + (state.selectedUserIds.has(u.id) ? ' is-selected' : '');
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    applyAvatar(avatar, { avatarUrl: u.avatar_url, name: u.full_name });
    const meta = document.createElement('span');
    meta.className = 'user-result-meta';
    meta.innerHTML = `<span class="user-result-name">${escapeHtml(u.full_name || 'Unnamed')}</span><span class="user-result-email">${escapeHtml(u.email)}</span>`;
    li.appendChild(avatar);
    li.appendChild(meta);
    li.addEventListener('click', () => toggleSelectedUser(u.id));
    el.userResults.appendChild(li);
  }
}

function toggleSelectedUser(userId) {
  if (state.selectedUserIds.has(userId)) state.selectedUserIds.delete(userId);
  else state.selectedUserIds.add(userId);
  renderSelectedUsers();
  searchUsers();
}

function renderSelectedUsers() {
  el.selectedUsers.innerHTML = '';
  for (const id of state.selectedUserIds) {
    const profile = state.profilesCache.get(id);
    const chip = document.createElement('span');
    chip.className = 'selected-chip';
    chip.innerHTML = `${escapeHtml(profile?.full_name || profile?.email || 'User')} <button type="button">✕</button>`;
    chip.querySelector('button').addEventListener('click', () => toggleSelectedUser(id));
    el.selectedUsers.appendChild(chip);
  }
  el.groupNameField.hidden = state.selectedUserIds.size < 2;
  el.createChatBtn.disabled = state.selectedUserIds.size === 0;
}

el.createChatBtn.addEventListener('click', async () => {
  const ids = Array.from(state.selectedUserIds);
  if (!ids.length) return;
  el.createChatBtn.disabled = true;
  try {
    if (ids.length === 1) {
      const convId = await findOrCreateDirectConversation(ids[0]);
      el.newChatModal.hidden = true;
      await loadConversations();
      openConversation(convId);
    } else {
      const groupName = el.groupNameInput.value.trim() || 'New group';
      const convId = await createGroupConversation(groupName, ids);
      el.newChatModal.hidden = true;
      await loadConversations();
      openConversation(convId);
    }
  } catch (err) {
    toast(err.message || 'Could not start chat', 'error');
  } finally {
    el.createChatBtn.disabled = false;
  }
});

async function findOrCreateDirectConversation(otherUserId) {
  const { data: mine } = await supabase
    .from('conversation_participants')
    .select('conversation_id, conversations!inner(is_group)')
    .eq('user_id', state.user.id)
    .eq('conversations.is_group', false);

  const { data: theirs } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', otherUserId);

  const theirIds = new Set((theirs || []).map(r => r.conversation_id));
  const existing = (mine || []).find(r => theirIds.has(r.conversation_id));
  if (existing) return existing.conversation_id;

  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .insert({ is_group: false, created_by: state.user.id })
    .select()
    .single();
  if (convErr) throw convErr;

  const { error: partErr } = await supabase.from('conversation_participants').insert([
    { conversation_id: conv.id, user_id: state.user.id },
    { conversation_id: conv.id, user_id: otherUserId },
  ]);
  if (partErr) throw partErr;

  return conv.id;
}

async function createGroupConversation(name, userIds) {
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .insert({ is_group: true, name, created_by: state.user.id })
    .select()
    .single();
  if (convErr) throw convErr;

  const rows = [state.user.id, ...userIds].map(uid => ({ conversation_id: conv.id, user_id: uid }));
  const { error: partErr } = await supabase.from('conversation_participants').insert(rows);
  if (partErr) throw partErr;

  return conv.id;
}

// =====================================================================
// Details panel — nickname, per-chat color, members
// =====================================================================

function renderDetailsPanel(conv) {
  const display = getConversationDisplay(conv);
  applyAvatar(el.detailsAvatar, { avatarUrl: display.avatarUrl, name: display.name });
  el.detailsName.textContent = display.name;
  el.detailsSub.textContent = display.statusText;

  el.nicknameInput.value = conv.myNickname || '';
  el.nicknameInput.placeholder = conv.is_group ? 'Add a nickname for this group' : `Add a nickname`;

  el.colorChips.innerHTML = '';
  CHAT_COLORS.forEach(color => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'color-chip' + (conv.myThemeColor === color ? ' is-selected' : '');
    chip.style.background = color;
    chip.addEventListener('click', () => setConversationColor(conv, color));
    el.colorChips.appendChild(chip);
  });

  if (conv.is_group) {
    el.membersSection.hidden = false;
    el.membersList.innerHTML = '';
    conv.participants.forEach(p => {
      const profile = state.profilesCache.get(p.user_id) || {};
      const li = document.createElement('li');
      const avatar = document.createElement('span');
      avatar.className = 'avatar';
      applyAvatar(avatar, { avatarUrl: profile.avatar_url, name: profile.full_name });
      li.appendChild(avatar);
      const label = document.createElement('span');
      label.textContent = p.user_id === state.user.id ? 'You' : (profile.full_name || profile.email || 'Member');
      li.appendChild(label);
      el.membersList.appendChild(li);
    });
  } else {
    el.membersSection.hidden = true;
  }
}

let nicknameDebounce;
el.nicknameInput.addEventListener('input', () => {
  clearTimeout(nicknameDebounce);
  nicknameDebounce = setTimeout(async () => {
    const conv = state.conversations.get(state.activeConversationId);
    if (!conv) return;
    const nickname = el.nicknameInput.value.trim() || null;
    conv.myNickname = nickname;
    await supabase.from('conversation_participants')
      .update({ nickname })
      .eq('conversation_id', conv.id)
      .eq('user_id', state.user.id);
    renderChatHeader(conv);
    renderConversationList();
  }, 500);
});

async function setConversationColor(conv, color) {
  conv.myThemeColor = color;
  renderDetailsPanel(conv);
  el.messagesEl.style.setProperty('--conv-accent', color);
  await supabase.from('conversation_participants')
    .update({ theme_color: color })
    .eq('conversation_id', conv.id)
    .eq('user_id', state.user.id);
}

el.detailsToggleBtn.addEventListener('click', () => {
  el.detailsPanel.hidden = !el.detailsPanel.hidden;
  if (window.innerWidth <= 760 && !el.detailsPanel.hidden) {
    el.appShell.classList.add('view-details');
    el.appShell.classList.remove('view-list', 'view-chat');
  }
});
el.chatHeaderIdentity.addEventListener('click', () => el.detailsToggleBtn.click());
el.closeDetailsBtn.addEventListener('click', () => {
  el.detailsPanel.hidden = true;
  if (window.innerWidth <= 760) {
    el.appShell.classList.add('view-chat');
    el.appShell.classList.remove('view-details');
  }
});

// =====================================================================
// Mobile navigation
// =====================================================================

el.backToListBtn.addEventListener('click', () => {
  el.appShell.classList.add('view-list');
  el.appShell.classList.remove('view-chat', 'view-details');
});

el.appShell.classList.add('view-list');

// =====================================================================
// PWA — install prompt & service worker
// =====================================================================

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.deferredInstallPrompt = e;
  el.installBtn.hidden = false;
  el.installMenuItem.hidden = false;
});

window.addEventListener('appinstalled', () => {
  state.deferredInstallPrompt = null;
  el.installBtn.hidden = true;
  el.installMenuItem.hidden = true;
  toast('PulseChat installed', 'success');
});

async function triggerInstall() {
  if (!state.deferredInstallPrompt) return;
  state.deferredInstallPrompt.prompt();
  await state.deferredInstallPrompt.userChoice;
  state.deferredInstallPrompt = null;
  el.installBtn.hidden = true;
  el.installMenuItem.hidden = true;
}
el.installBtn.addEventListener('click', triggerInstall);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline shell unavailable, app still works online */ });
  });
}
