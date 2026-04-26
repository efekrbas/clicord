import blessed from 'blessed';
import { Client } from 'discord.js-selfbot-v13';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { basename } from 'path';
import { openFileInBrowser } from './utils.js';

dotenv.config();

// ── State ───────────────────────────────────────────
let client = null;
let currentChannel = null;
let currentGuild = null;
let dmChannels = [];
let guilds = [];
let serverChannels = [];
let messages = [];
let messageMap = new Map();
let messageFiles = new Map();
let deletedMessageIds = new Set();
let sentMessageIds = new Set();
let unreadCounts = new Map();

// activeSection: 'dm' | 'servers' | 'channels'
let activeSection = 'dm';
// focusArea: 'sidebar' | 'chat'
let focusArea = 'sidebar';

// ── Main Export ─────────────────────────────────────
export async function startTUI(selectedToken = null) {
  console.log(chalk.cyan('\n  Starting clicord...\n'));

  const token = selectedToken;
  if (!token) {
    console.error(chalk.red('HATA: Giriş için geçerli bir token bulunamadı!'));
    process.exit(1);
  }

  client = new Client({
    checkUpdate: false,
    ws: { properties: { browser: "Discord Client" } },
    intents: []
  });

  const globalPresences = new Map();
  client.ws.on('READY', (data) => {
    if (data.presences) {
      data.presences.forEach(p => globalPresences.set(p.user.id, p.status));
    }
  });
  client.ws.on('PRESENCE_UPDATE', (data) => {
    if (data.user && data.status) {
      globalPresences.set(data.user.id, data.status);
      if (typeof updateDmList === 'function') {
        try { updateDmList(); } catch(e) {}
      }
    }
  });

  // ── Screen ──────────────────────────────────────
  const screen = blessed.screen({
    smartCSR: true,
    title: 'clicord',
    fullUnicode: true,
    forceUnicode: true
  });



  // ── Left Sidebar (20%) ──────────────────────────
  const sidebar = blessed.box({
    top: 0,
    left: 0,
    width: '20%',
    height: '100%',
    style: { bg: 'black' }
  });

  const sidebarHeader = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '{bold}{white-fg} clicord{/white-fg}{/bold}',
    tags: true,
    style: { bg: '#1a1a2e', fg: 'white' },
    border: { type: 'line', fg: '#333333' }
  });

  // ── DM Section ──────────────────────────────────
  const dmHeader = blessed.box({
    top: 3,
    left: 0,
    width: '100%',
    height: 1,
    content: '{bold}{yellow-fg} ▼ Direct Messages{/yellow-fg}{/bold}',
    tags: true,
    style: { bg: '#16213e', fg: 'white' }
  });

  const dmList = blessed.list({
    top: 4,
    left: 0,
    width: '100%',
    height: '40%-4',
    keys: false,
    vi: false,
    mouse: true,
    tags: true,
    invertSelected: false,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '│', style: { fg: '#555555' } },
    style: {
      bg: '#0f3460',
      selected: { bg: '#1a1a2e', fg: 'white', bold: true },
      item: { bg: 'black', fg: '#cccccc' }
    }
  });

  // ── Server Section ──────────────────────────────
  const serverHeader = blessed.box({
    top: '40%',
    left: 0,
    width: '100%',
    height: 1,
    content: '{bold}{yellow-fg} ▼ Servers{/yellow-fg}{/bold}',
    tags: true,
    style: { bg: '#16213e', fg: 'white' }
  });

  const serverList = blessed.list({
    top: '40%+1',
    left: 0,
    width: '100%',
    height: '60%-1',
    keys: false,
    vi: false,
    mouse: true,
    tags: true,
    invertSelected: false,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '│', style: { fg: '#555555' } },
    style: {
      bg: '#0f3460',
      selected: { bg: '#1a1a2e', fg: 'white', bold: true },
      item: { bg: 'black', fg: '#cccccc' }
    }
  });

  sidebar.append(sidebarHeader);
  sidebar.append(dmHeader);
  sidebar.append(dmList);
  sidebar.append(serverHeader);
  sidebar.append(serverList);

  // ── Right Panel (80%) ───────────────────────────
  const rightPanel = blessed.box({
    top: 0,
    left: '20%',
    width: '80%',
    height: '100%',
    style: { bg: 'black' }
  });

  const chatHeader = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '{bold}{green-fg} ● Live{/green-fg} {white-fg}│ Select a chat{/white-fg}{/bold}',
    tags: true,
    style: { bg: '#1a1a2e', fg: 'white' },
    border: { type: 'line', fg: '#333333' }
  });

  const messageArea = blessed.box({
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-6',
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '│', style: { fg: '#555555' } },
    keys: true,
    vi: true,
    mouse: true,
    tags: true,
    content: '{center}{white-fg}Messages will appear here{/white-fg}{/center}',
    style: { bg: 'black', fg: 'white' }
  });

  const inputBox = blessed.textarea({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    inputOnFocus: true,
    keys: true,
    tags: true,
    style: {
      bg: '#16213e',
      fg: 'white',
      focus: { bg: '#0f3460', fg: 'white' }
    },
    border: { type: 'line', fg: '#333333' }
  });

  // Enter key submits instead of adding newline
  inputBox.key('enter', () => {
    const value = inputBox.getValue().replace(/\n/g, '');
    inputBox.emit('submit', value);
  });

  rightPanel.append(chatHeader);
  rightPanel.append(messageArea);
  rightPanel.append(inputBox);

  // Hide cursor by default, show only when inputBox has focus
  screen.program.write('\x1b[?25l');
  inputBox.on('focus', () => { screen.program.write('\x1b[?25h'); });
  inputBox.on('blur', () => { screen.program.write('\x1b[?25l'); });

  // ── Assemble Screen ─────────────────────────────
  screen.append(sidebar);
  screen.append(rightPanel);

  // ── Helper: Update sidebar selection markers ────
  function updateDmList(selectedIdx = null) {
    const idx = selectedIdx !== null ? selectedIdx : (dmList.selected || 0);
    const items = dmChannels.map((ch, i) => {
      const prefix = i === idx ? '{yellow-fg}>{/yellow-fg} ' : '  ';
      const unread = unreadCounts.get(ch.channel.id) || 0;
      const badge = unread > 0 ? ` {red-fg}(${unread}){/red-fg}` : '';
      return `${prefix}${ch.name}${badge}`;
    });
    dmList.setItems(items);
    if (items.length > 0 && idx < items.length) {
      dmList.select(idx);
      dmList.scrollTo(idx);
    }
    screen.render();
  }

  function updateServerList(selectedIdx = null) {
    const idx = selectedIdx !== null ? selectedIdx : (serverList.selected || 0);
    const items = guilds.map((g, i) => {
      const prefix = i === idx ? '{yellow-fg}>{/yellow-fg} ' : '  ';
      return `${prefix}${g.name}`;
    });
    serverList.setItems(items);
    if (items.length > 0 && idx < items.length) {
      serverList.select(idx);
      serverList.scrollTo(idx);
    }
    screen.render();
  }

  // ── Helper: Escape emoji for blessed tags ───────
  function safeEmoji(text) {
    if (!text) return '';
    return text.replace(/([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{3000}-\u{303F}\u{30A0}-\u{30FF}\u{FF01}-\u{FF60}\u{2300}-\u{23FF}])/gu, '$1 ');
  }

  // ── Helper: Format author name ──────────────────
  function formatAuthor(user) {
    if (!user) return 'Unknown';
    return user.globalName || user.global_name || user.displayName || user.username;
  }

  function getStatusEmoji(user) {
    if (!user) return '⚪';
    let status = globalPresences.get(user.id) || user.presence?.status;
    
    if (!status) {
      for (const guild of client.guilds.cache.values()) {
        const presence = guild.presences.cache.get(user.id);
        if (presence) {
          status = presence.status;
          break;
        }
      }
    }

    if (status === 'online') return '🟢';
    if (status === 'dnd') return '🔴';
    if (status === 'idle') return '🟠';
    return '⚪';
  }

  function cleanPreview(text) {
    if (!text) return '';
    let cleaned = text
      .replace(/<@!?(\d+)>/g, (match, id) => {
        const user = client.users.cache.get(id);
        return user ? `@${formatAuthor(user)}` : '@user';
      })
      .replace(/<#(\d+)>/g, (match, id) => {
        const ch = client.channels.cache.get(id);
        return ch ? `#${ch.name}` : '#channel';
      })
      .replace(/<@&(\d+)>/g, '@role')
      .replace(/<:(\w+):\d+>/g, ':$1:')
      .replace(/<a:(\w+):\d+>/g, ':$1:');
    return cleaned.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
  }

  // ── Helper: Render messages ─────────────────────
  function renderMessages() {
    if (messages.length === 0) {
      messageArea.setContent('{center}{white-fg}No messages{/white-fg}{/center}');
      screen.render();
      return;
    }
    let content = '';
    for (const msg of messages) {
      const time = new Date(msg.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
      });
      let body = '';
      if (msg.isImage) {
        body = msg.fileName
          ? `{blue-fg}[File: {yellow-fg}${msg.fileName}{/yellow-fg}]{/blue-fg}`
          : '{blue-fg}[Image]{/blue-fg}';
      } else {
        body = msg.content || '{white-fg}(empty message){/white-fg}';
      }
      if (msg.messageId && deletedMessageIds.has(msg.messageId)) {
        body += ' {red-fg}[deleted]{/red-fg}';
      }
      const prefix = msg.isOwn
        ? '{green-fg}You{/green-fg}'
        : `{cyan-fg}${msg.username}{/cyan-fg}`;
      const idTag = msg.messageId
        ? ` {blue-fg}({yellow-fg}${msg.messageId}{/yellow-fg}){/blue-fg}`
        : '';
      content += `${prefix} {white-fg}[${time}]{/white-fg}\n${body}${idTag}\n\n`;
    }
    messageArea.setContent(content);
    messageArea.setScrollPerc(100);
    screen.render();
  }

  // ── Helper: Add a message to state ──────────────
  function addMessage(username, content, timestamp, isImage = false, isOwn = false, messageId = null, replyTo = null, imageUrl = null, fileName = null) {
    const msgObj = { username, content: content || '', timestamp, isImage, isOwn, messageId, replyTo, fileName };
    if (messageId && messageMap.has(messageId)) return;
    messages.push(msgObj);
    if (messageId) {
      messageMap.set(messageId, msgObj);
      if (imageUrl) messageFiles.set(messageId, { url: imageUrl, fileName });
    }
    renderMessages();
  }

  // ── Helper: Load channel messages ───────────────
  async function loadChannelMessages(channel) {
    messages = [];
    messageMap.clear();
    messageFiles.clear();
    deletedMessageIds.clear();
    sentMessageIds.clear();
    messageArea.setContent('{center}{yellow-fg}Loading messages...{/yellow-fg}{/center}');
    screen.render();
    try {
      const fetched = await channel.messages.fetch({ limit: 50 });
      const sorted = Array.from(fetched.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      for (const msg of sorted) {
        const hasImage = msg.attachments?.size > 0;
        const att = hasImage ? msg.attachments.first() : null;
        let content = cleanPreview(msg.content) || '';
        if (msg.embeds && msg.embeds.length > 0) {
          for (const embed of msg.embeds) {
            if (embed.title) content += (content ? '\n' : '') + `{yellow-fg}${cleanPreview(embed.title)}{/yellow-fg}`;
            if (embed.description) content += (content ? '\n' : '') + cleanPreview(embed.description);
            if (embed.fields && embed.fields.length > 0) {
              for (const field of embed.fields) {
                content += (content ? '\n' : '') + `{cyan-fg}${cleanPreview(field.name)}:{/cyan-fg} ${cleanPreview(field.value)}`;
              }
            }
            if (embed.footer && embed.footer.text) {
              content += (content ? '\n' : '') + `{white-fg}${cleanPreview(embed.footer.text)}{/white-fg}`;
            }
          }
        }
        addMessage(
          formatAuthor(msg.author),
          content,
          msg.createdTimestamp,
          hasImage,
          msg.author.id === client.user.id,
          msg.id,
          msg.reference?.messageId || null,
          att?.url || null,
          att?.name || null
        );
      }
      if (messages.length === 0) renderMessages();
    } catch (err) {
      addMessage('System', `Error: ${err.message}`, Date.now());
    }
  }

  // ── Sidebar Navigation ──────────────────────────
  function focusSidebar() {
    focusArea = 'sidebar';
    if (activeSection === 'dm') {
      dmList.focus();
      dmHeader.setContent('{bold}{yellow-fg} ▼ Direct Messages{/yellow-fg}{/bold}');
      serverHeader.setContent('{bold}{white-fg} ▶ Servers{/white-fg}{/bold}');
    } else {
      serverList.focus();
      dmHeader.setContent('{bold}{white-fg} ▶ Direct Messages{/white-fg}{/bold}');
      serverHeader.setContent('{bold}{yellow-fg} ▼ Servers{/yellow-fg}{/bold}');
    }
    screen.render();
  }

  function focusChat() {
    focusArea = 'chat';
    inputBox.focus();
    screen.render();
  }

  // DM list keyboard navigation
  dmList.on('keypress', (ch, key) => {
    if (key.name === 'down' || key.name === 'j') {
      if (dmList.selected < dmList.items.length - 1) updateDmList(dmList.selected + 1);
      return false;
    } else if (key.name === 'up' || key.name === 'k') {
      if (dmList.selected > 0) updateDmList(dmList.selected - 1);
      return false;
    } else if (key.name === 'tab') {
      activeSection = 'servers';
      focusSidebar();
      return false;
    } else if (key.name === 'enter') {
      dmList.emit('select', dmList.items[dmList.selected], dmList.selected);
      return false;
    }
  });

  // Server list keyboard navigation
  serverList.on('keypress', (ch, key) => {
    if (key.name === 'down' || key.name === 'j') {
      if (serverList.selected < serverList.items.length - 1) updateServerList(serverList.selected + 1);
      return false;
    } else if (key.name === 'up' || key.name === 'k') {
      if (serverList.selected > 0) updateServerList(serverList.selected - 1);
      return false;
    } else if (key.name === 'tab') {
      activeSection = 'dm';
      focusSidebar();
      return false;
    } else if (key.name === 'enter') {
      serverList.emit('select', serverList.items[serverList.selected], serverList.selected);
      return false;
    }
  });

  // ── DM Select ───────────────────────────────────
  dmList.on('select', async (item, index) => {
    const selected = dmChannels[index];
    if (!selected) return;
    currentChannel = selected.channel;
    currentGuild = null;
    unreadCounts.set(currentChannel.id, 0);
    updateDmList();
    chatHeader.setContent(`{bold}{green-fg} ●{/green-fg} {white-fg}${selected.name}{/white-fg}{/bold}`);
    await loadChannelMessages(currentChannel);
    focusChat();
  });

  // ── Server/Channel Select (unified handler) ─────
  serverList.on('select', async (item, index) => {
    if (activeSection === 'servers') {
      // Server selection → load channels
      const selected = guilds[index];
      if (!selected) return;
      currentGuild = selected.guild;
      currentChannel = null;

      // Load server channels into serverList
      serverChannels = [];
      const guildChannels = currentGuild.channels.cache;
      for (const channel of guildChannels.values()) {
        if (!channel.viewable) continue;
        const t = channel.type;
        const cn = channel.constructor?.name || '';
        if (t === 0 || t === 'GUILD_TEXT' || t === 'text' || cn === 'TextChannel') {
          serverChannels.push({ channel, name: `# ${safeEmoji(channel.name) || 'Unnamed'}` });
        }
      }
      serverChannels.sort((a, b) => (a.channel.position || 0) - (b.channel.position || 0));

      // Load channel list into serverList
      activeSection = 'channels';
      serverHeader.setContent(`{bold}{yellow-fg} ▼ ${selected.name}{/yellow-fg}{/bold}`);
      const items = serverChannels.map((c, i) => {
        const prefix = i === 0 ? '{yellow-fg}>{/yellow-fg} ' : '  ';
        return `${prefix}${c.name}`;
      });
      serverList.setItems(items);
      if (items.length > 0) serverList.select(0);
      chatHeader.setContent(`{bold}{green-fg} ●{/green-fg} {white-fg}${selected.name} │ Select a channel{/white-fg}{/bold}`);
      screen.render();

    } else if (activeSection === 'channels') {
      // Channel selection → open chat
      const selected = serverChannels[index];
      if (!selected) return;
      currentChannel = selected.channel;
      chatHeader.setContent(`{bold}{green-fg} ●{/green-fg} {white-fg}${currentGuild.name} > ${selected.name}{/white-fg}{/bold}`);
      await loadChannelMessages(currentChannel);
      focusChat();
    }
  });

  // ── Message Send (input submit) ─────────────────
  inputBox.on('submit', async (value) => {
    const text = (value || '').trim();
    inputBox.clearValue();

    if (!text || !currentChannel) {
      inputBox.focus();
      screen.render();
      return;
    }

    try {
      if (text.startsWith('/')) {
        const parts = text.split(' ');
        const cmd = parts[0].substring(1).toLowerCase();

        if (cmd === 'reply' && parts.length >= 3) {
          const replyId = parts[1];
          const replyText = parts.slice(2).join(' ');
          const sent = await currentChannel.send({ content: replyText, reply: { messageReference: replyId } });
          sentMessageIds.add(sent.id);
          addMessage(client.user.username, replyText, sent.createdTimestamp, false, true, sent.id, replyId);
        } else if (cmd === 'upload' && parts.length >= 2) {
          const filePath = parts.slice(1).join(' ').replace(/^["']|["']$/g, '');
          if (!existsSync(filePath)) {
            addMessage('System', `File not found: ${filePath}`, Date.now());
          } else {
            const sent = await currentChannel.send({ files: [{ attachment: filePath, name: basename(filePath) }] });
            sentMessageIds.add(sent.id);
            const att = sent.attachments?.first();
            addMessage(client.user.username, '', sent.createdTimestamp, true, true, sent.id, null, att?.url, att?.name);
          }
        } else if (cmd === 'help') {
          addMessage('System', 'Commands:\n/reply <id> <message>\n/upload <file>\n/delete <id>\n/edit <id> <new_message>\n/view <id>', Date.now());
        } else if (cmd === 'delete' && parts.length >= 2) {
          const msg = await currentChannel.messages.fetch(parts[1]);
          if (msg.author.id === client.user.id) { await msg.delete(); addMessage('System', 'Message deleted.', Date.now()); }
          else addMessage('System', 'You can only delete your own messages.', Date.now());
        } else if (cmd === 'edit' && parts.length >= 3) {
          const msg = await currentChannel.messages.fetch(parts[1]);
          if (msg.author.id === client.user.id) {
            await msg.edit(parts.slice(2).join(' '));
            addMessage('System', 'Message edited.', Date.now());
          }
        } else if (cmd === 'view' && parts.length >= 2) {
          const info = messageFiles.get(parts[1]) || [...messageFiles.entries()].find(([k]) => k.startsWith(parts[1]))?.[1];
          if (info) { openFileInBrowser(info.url, info.fileName); addMessage('System', 'Opening file...', Date.now()); }
          else addMessage('System', 'File not found.', Date.now());
        } else {
          addMessage('System', `Unknown command: ${cmd}. Type /help`, Date.now());
        }
      } else {
        const sent = await currentChannel.send(text);
        sentMessageIds.add(sent.id);
        addMessage(client.user.username, text, sent.createdTimestamp, false, true, sent.id);
      }
    } catch (err) {
      addMessage('System', `Error: ${err.message}`, Date.now());
    }

    setImmediate(() => { inputBox.focus(); screen.render(); });
  });

  // ── Keyboard Shortcuts ──────────────────────────
  inputBox.on('keypress', () => screen.render());
  inputBox.key(['C-d'], () => { inputBox.clearValue(); inputBox.focus(); screen.render(); });

  screen.key(['escape'], () => {
    if (focusArea === 'chat') {
      if (activeSection === 'channels') {
        // Go back to server list
        activeSection = 'servers';
        serverHeader.setContent('{bold}{yellow-fg} ▼ Servers{/yellow-fg}{/bold}');
        updateServerList();
        chatHeader.setContent('{bold}{green-fg} ●{/green-fg} {white-fg}│ Select a chat{/white-fg}{/bold}');
        messageArea.setContent('{center}{white-fg}Messages will appear here{/white-fg}{/center}');
      } else if (activeSection === 'dm') {
        chatHeader.setContent('{bold}{green-fg} ● Live{/green-fg} {white-fg}│ Select a chat{/white-fg}{/bold}');
        messageArea.setContent('{center}{white-fg}Messages will appear here{/white-fg}{/center}');
      }
      focusSidebar();
    } else if (activeSection === 'channels') {
      activeSection = 'servers';
      serverHeader.setContent('{bold}{yellow-fg} ▼ Servers{/yellow-fg}{/bold}');
      updateServerList();
    } else {
      process.exit(0);
    }
  });

  // Tab: toggle sidebar <-> chat
  screen.key(['tab'], () => {
    if (focusArea === 'sidebar' && currentChannel) {
      focusChat();
    } else {
      focusSidebar();
    }
  });

  // ── Discord Events ──────────────────────────────
  client.on('messageCreate', (message) => {
    try {
      // Unread counter
      if (message.author.id !== client.user.id) {
        const chId = message.channel.id;
        const isCurrent = currentChannel && currentChannel.id === chId && focusArea === 'chat';
        if (!isCurrent) {
          unreadCounts.set(chId, (unreadCounts.get(chId) || 0) + 1);
          updateDmList();
        }
      }
      // Show in chat if current channel
      if (currentChannel && message.channel.id === currentChannel.id) {
        if (messageMap.has(message.id) || sentMessageIds.has(message.id)) return;
        const hasImg = message.attachments?.size > 0;
        const att = hasImg ? message.attachments.first() : null;
        let content = cleanPreview(message.content) || '';
        if (message.embeds && message.embeds.length > 0) {
          for (const embed of message.embeds) {
            if (embed.title) content += (content ? '\n' : '') + `{yellow-fg}${cleanPreview(embed.title)}{/yellow-fg}`;
            if (embed.description) content += (content ? '\n' : '') + cleanPreview(embed.description);
            if (embed.fields && embed.fields.length > 0) {
              for (const field of embed.fields) {
                content += (content ? '\n' : '') + `{cyan-fg}${cleanPreview(field.name)}:{/cyan-fg} ${cleanPreview(field.value)}`;
              }
            }
            if (embed.footer && embed.footer.text) {
              content += (content ? '\n' : '') + `{white-fg}${cleanPreview(embed.footer.text)}{/white-fg}`;
            }
          }
        }
        addMessage(
          formatAuthor(message.author), content, message.createdTimestamp,
          hasImg, message.author.id === client.user.id, message.id,
          message.reference?.messageId || null, att?.url || null, att?.name || null
        );
      }
    } catch (e) { /* silent */ }
  });

  client.on('messageDelete', (msg) => {
    if (currentChannel && msg.channel.id === currentChannel.id && messageMap.has(msg.id)) {
      deletedMessageIds.add(msg.id);
      renderMessages();
    }
  });

  client.on('messageUpdate', (_, newMsg) => {
    if (currentChannel && newMsg.channel.id === currentChannel.id && messageMap.has(newMsg.id)) {
      messageMap.get(newMsg.id).content = newMsg.content || '';
      renderMessages();
    }
  });

  // ── Client Ready ────────────────────────────────
  client.once('ready', async () => {
    sidebarHeader.setContent(`{bold}{white-fg} ${client.user.username}{/white-fg}{/bold}`);

    // Load DM channels
    for (const channel of client.channels.cache.values()) {
      const t = channel.type;
      const cn = channel.constructor?.name || '';
      if (t === 1 || t === 'DM' || cn === 'DMChannel') {
        const statusEmoji = getStatusEmoji(channel.recipient);
        const name = `${statusEmoji} ${formatAuthor(channel.recipient) || 'Unknown'}`;
        dmChannels.push({ channel, name });
      } else if (t === 3 || t === 'GROUP_DM' || cn === 'GroupDMChannel') {
        let gName = channel.name;
        if (!gName && channel.recipients) {
          gName = channel.recipients.map(r => formatAuthor(r)).slice(0, 3).join(', ');
        }
        dmChannels.push({ channel, name: `👥 ${gName || 'Group'}` });
      }
    }

    // Load servers
    for (const guild of client.guilds.cache.values()) {
      guilds.push({ guild, name: guild.name || 'Unknown' });
    }
    guilds.sort((a, b) => a.name.localeCompare(b.name));

    updateDmList();
    updateServerList();
    focusSidebar();
  });

  // ── Login ───────────────────────────────────────
  try {
    await client.login(token);
  } catch (err) {
    console.error(chalk.red(`Login error: ${err.message}`));
    process.exit(1);
  }

  screen.render();
}
