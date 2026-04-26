import blessed from 'blessed';
import { Client } from 'discord.js-selfbot-v13';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import { openFileInBrowser } from './utils.js';

dotenv.config();

let client = null;
let currentChannel = null;
let channels = [];
let messages = [];
let messageMap = new Map();
let messageFiles = new Map(); // Stores file URLs for all attachments (images and files)
let deletedMessageIds = new Set(); // Track deleted messages
let sentMessageIds = new Set(); // Track messages we've already added manually
let selectedIndex = 0;
let mode = 'threads';
let replyToMessageId = null;
let unreadCounts = new Map(); // Store unread counts by channel ID


export async function startChat(selectedToken = null) {
  console.log(chalk.cyan('\nStarting Discord Chat...\n'));

  const token = selectedToken;
  if (!token) {
    console.error(chalk.red('HATA: Giriş için geçerli bir token bulunamadı!'));
    process.exit(1);
  }

  client = new Client({
    checkUpdate: false,
    ws: {
      properties: {
        browser: "Discord Client"
      }
    },
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
      if (typeof updateThreadList === 'function') {
        try { updateThreadList(); } catch(e) {}
      }
    }
  });

  const screen = blessed.screen({
    smartCSR: true,
    title: 'clicord - dm',
    fullUnicode: true
  });


  const container = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    style: {
      bg: 'black'
    }
  });

  const header = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: 'clicord (• Live) / DM',
    tags: true,
    style: {
      bg: 'black',
      fg: 'white',
      bold: true
    }
  });

  const threadHeader = blessed.text({
    top: 0,
    right: 0,
    width: 15,
    height: 1,
    content: '{green-fg}DM\'s{/green-fg}',
    tags: true
  });

  const threadList = blessed.list({
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-3',
    keys: false,
    vi: false,
    mouse: true,
    tags: true,
    invertSelected: false,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: ' ',
      inverse: true
    },
    style: {
      selected: {
        bg: 'black',
        fg: 'white'
      },
      item: {
        bg: 'black',
        fg: 'white'
      }
    }
  });

  const messageList = blessed.box({
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-9',
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: ' ',
      inverse: true
    },
    keys: true,
    vi: true,
    mouse: true,
    tags: true,
    style: {
      bg: 'black',
      fg: 'white'
    }
  });

  const input = blessed.textarea({
    bottom: 3,
    left: 0,
    width: '100%',
    height: 3,
    inputOnFocus: true,
    keys: true,
    style: {
      bg: 'black',
      fg: 'white',
      focus: {
        bg: 'blue',
        fg: 'white'
      }
    }
  });

  // Enter key submits instead of adding newline
  input.key('enter', () => {
    const value = input.getValue().replace(/\n/g, '');
    input.emit('submit', value);
  });

  // Hide cursor by default, show only when input has focus
  screen.program.write('\x1b[?25l');
  input.on('focus', () => { screen.program.write('\x1b[?25h'); });
  input.on('blur', () => { screen.program.write('\x1b[?25l'); });

  const helpText = blessed.text({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: 'j/k: navigate, Enter: select, Esc: quit',
    style: {
      bg: 'black',
      fg: 'grey'
    }
  });

  screen.append(container);
  container.append(header);
  header.append(threadHeader);
  container.append(threadList);
  container.append(messageList);
  container.append(input);
  container.append(helpText);

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

  function switchMode(newMode) {
    mode = newMode;
    if (mode === 'threads') {
      messageList.setContent('');
      messageList.setScrollPerc(0);
      input.clearValue();
      threadList.show();
      messageList.hide();
      input.hide();
      threadList.focus();
      helpText.setContent('j/k: navigate, Enter: select, Esc: quit');
      
      if (typeof client !== 'undefined' && client && client.user) {
        header.setContent(`clicord (• Live) / Chat with ${client.user.username}`);
      }
    } else if (mode === 'chat') {
      threadList.hide();
      messageList.show();
      input.show();
      input.focus();
      helpText.setContent('Esc: back, Ctrl+D: clear input, /upload <path>: upload file, /view <id>: open file, /reply <id> <msg>: reply, /edit <id> <msg>: edit, /help: commands');
    }
    screen.alloc();
    screen.render();
  }

  function renderAllMessages() {
    try {
      let content = '';
      for (const msg of messages) {
        const time = new Date(msg.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });

        let messageContent = '';
        if (msg.isImage) {
          const fileUrl = messageFiles.get(msg.messageId);
          if (msg.fileName) {
            messageContent = `{blue-fg}[File: {/blue-fg}{yellow-fg}${msg.fileName}{/yellow-fg}{blue-fg}]{/blue-fg}`;
          } else if (fileUrl && msg.messageId) {
            messageContent = `{blue-fg}[Image]{/blue-fg}`;
          } else {
            messageContent = `{blue-fg}[File]{/blue-fg}`;
          }
        } else if (msg.content && msg.content.trim()) {
          messageContent = msg.content;
        } else {
          messageContent = '{white-fg}(empty message){/white-fg}';
        }

        // Add "message deleted" if message was deleted
        if (msg.messageId && deletedMessageIds.has(msg.messageId)) {
          messageContent += ` {red-fg}[message deleted]{/red-fg}`;
        }

        let replyInfo = '';
        if (msg.replyTo) {
          const repliedMsg = messageMap.get(msg.replyTo);
          if (repliedMsg) {
            const replyContent = repliedMsg.content ? repliedMsg.content.substring(0, 30) : '[Media]';
            replyInfo = `{yellow-fg}↪ Replying to ${repliedMsg.username}: ${replyContent}${replyContent.length >= 30 ? '...' : ''}{/yellow-fg}\n`;
          }
        }

        const isSystemMessage = msg.username === 'System';
        const prefix = isSystemMessage ? '{red-fg}System{/red-fg}' : (msg.isOwn ? '{green-fg}You{/green-fg}' : `{cyan-fg}${msg.username}{/cyan-fg}`);
        const idInfo = (msg.messageId && !isSystemMessage) ? ` {blue-fg}({/blue-fg}{yellow-fg}${msg.messageId}{/yellow-fg}{blue-fg}){/blue-fg}` : '';

        content += `${replyInfo}${prefix} [${time}]\n${messageContent}${idInfo}\n\n`;
      }

      messageList.setContent(content);
      messageList.setScrollPerc(100);
      screen.render();
    } catch (error) {
      console.error('renderAllMessages error:', error);
    }
  }

  function addMessage(username, content, timestamp, isImage = false, isOwn = false, messageId = null, replyTo = null, imageUrl = null, fileName = null, isSticker = false, stickerName = null) {
    try {
      const time = new Date(timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });

      let messageContent = '';
      if (isSticker) {
        messageContent = `{blue-fg}[Sticker: {yellow-fg}${stickerName || 'Unknown'}{/yellow-fg}]{/blue-fg}`;
        if (imageUrl) {
          messageFiles.set(messageId, { url: imageUrl, fileName: `Sticker_${stickerName || 'Unknown'}.png` });
        }
      } else if (isImage && fileName) {
        messageContent = `{blue-fg}[File: {/blue-fg}{yellow-fg}${fileName}{/yellow-fg}{blue-fg}]{/blue-fg}`;
        if (imageUrl) {
          messageFiles.set(messageId, { url: imageUrl, fileName: fileName });
        }
      } else if (isImage && imageUrl) {
        messageContent = `{blue-fg}[Image]{/blue-fg}`;
        messageFiles.set(messageId, { url: imageUrl, fileName: null });
      } else if (isImage) {
        messageContent = `{blue-fg}[File]{/blue-fg}`;
      } else if (content && content.trim()) {
        messageContent = content;
      } else {
        messageContent = '{white-fg}(empty message){/white-fg}';
      }

      let replyInfo = '';
      if (replyTo) {
        const repliedMsg = messageMap.get(replyTo);
        if (repliedMsg) {
          const replyContent = repliedMsg.content ? repliedMsg.content.substring(0, 30) : '[Media]';
          replyInfo = `{yellow-fg}↪ Replying to ${repliedMsg.username}: ${replyContent}${replyContent.length >= 30 ? '...' : ''}{/yellow-fg}\n`;
        }
      }

      // Sistem mesajları için ID gösterme
      const isSystemMessage = username === 'System';
      const prefix = isSystemMessage ? '{red-fg}System{/red-fg}' : (isOwn ? '{green-fg}You{/green-fg}' : `{cyan-fg}${username}{/cyan-fg}`);
      const idInfo = (messageId && !isSystemMessage) ? ` {blue-fg}({/blue-fg}{yellow-fg}${messageId}{/yellow-fg}{blue-fg}){/blue-fg}` : '';

      const message = `${replyInfo}${prefix} [${time}]\n${messageContent}${idInfo}\n\n`;

      const msgObj = { username, content: isSticker ? `[Sticker: ${stickerName}]` : (content || ''), timestamp, isImage, isOwn, messageId, replyTo, fileName };

      // Check if message already exists to prevent duplicates
      if (messageId && messageMap.has(messageId)) {
        return;
      }

      messages.push(msgObj);

      if (messageId) {
        messageMap.set(messageId, msgObj);
      }

      const currentContent = messageList.getContent() || '';
      messageList.setContent(currentContent + message);

      messageList.setScrollPerc(100);
      screen.render();
    } catch (error) {
      console.error('addMessage error:', error);
    }
  }

  async function loadChannelMessages(channel) {
    try {
      const fetched = await channel.messages.fetch({ limit: 50 });
      const sortedMessages = Array.from(fetched.values())
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      messageList.setContent('');
      messages = [];
      messageMap.clear();
      messageFiles.clear();
      deletedMessageIds.clear();
      sentMessageIds.clear();

      for (const msg of sortedMessages) {
        const hasImage = msg.attachments && msg.attachments.size > 0;
        const isOwn = msg.author.id === client.user.id;
        const replyTo = msg.reference?.messageId || null;

        const hasSticker = msg.stickers && msg.stickers.size > 0;
        let stickerUrl = null;
        let stickerName = null;

        if (hasSticker) {
          const sticker = msg.stickers.first();
          stickerUrl = sticker.url || sticker.format === 1 ? `https://media.discordapp.net/stickers/${sticker.id}.png` : null;
          stickerName = sticker.name || 'Unknown Sticker';
        }

        let imageUrl = null;
        let fileName = null;
        if (hasImage) {
          const attachment = msg.attachments.first();
          imageUrl = attachment?.url || null;
          fileName = attachment?.name || null;
        }

        let content = msg.content || '';

        // Handle system messages if content is empty
        if (!content && !hasSticker && msg.type !== 'DEFAULT' && msg.type !== 'REPLY') {
          content = getSystemMessageEventText(msg);
        }

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
          isOwn,
          msg.id,
          replyTo,
          hasSticker ? stickerUrl : imageUrl,
          fileName,
          hasSticker,
          stickerName
        );
      }
    } catch (error) {
      addMessage('System', `Error loading messages: ${error.message}`, Date.now());
    }
  }

  function formatAuthor(user) {
    if (!user) return 'Unknown';

    // Try to get global name from various possible properties
    const globalName = user.globalName || user.global_name || user.displayName;

    // Return visible name if available, otherwise username
    return globalName || user.username;
  }

  function getSystemMessageEventText(msg) {
    switch (msg.type) {
      case 'RECIPIENT_ADD':
      case 1:
        return 'Added a recipient.';
      case 'RECIPIENT_REMOVE':
      case 2:
        return 'Removed a recipient.';
      case 'CALL':
      case 3:
        return 'Started a call.';
      case 'CHANNEL_NAME_CHANGE':
      case 4:
        return 'Changed the channel name.';
      case 'CHANNEL_ICON_CHANGE':
      case 5:
        return 'Changed the channel icon.';
      case 'CHANNEL_PINNED_MESSAGE':
      case 6:
        return 'Pinned a message.';
      case 'USER_JOIN':
      case 7:
        return 'Joined the server.';
      case 'GUILD_BOOST':
      case 8:
        return 'Boosted the server.';
      case 'GUILD_BOOST_TIER_1':
      case 9:
        return 'Boosted the server to Level 1.';
      case 'GUILD_BOOST_TIER_2':
      case 10:
        return 'Boosted the server to Level 2.';
      case 'GUILD_BOOST_TIER_3':
      case 11:
        return 'Boosted the server to Level 3.';
      case 'CHANNEL_FOLLOW_ADD':
      case 12:
        return 'Followed a channel.';
      case 'THREAD_CREATED':
      case 18:
        return 'Created a thread.';
      case 'THREAD_STARTER_MESSAGE':
      case 21:
        return 'Started a thread.';
      case 'CONTEXT_MENU_COMMAND':
      case 23:
        return 'Used a context menu command.';
      case 'AUTO_MODERATION_ACTION':
      case 24:
        return 'Auto Moderation action.';
      default:
        // Try to handle numeric types if string types fail (Discord.js versions differ)
        if (msg.type === 3) return 'Started a call.';
        if (msg.type === 6) return 'Pinned a message.';
        return '';
    }
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
    // Escape { } to prevent blessed tag corruption
    cleaned = cleaned.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
    return cleaned;
  }

  function updateThreadList(selectedIndexOverride = null) {
    const currentSelected = selectedIndexOverride !== null ? selectedIndexOverride : (threadList.selected >= 0 ? threadList.selected : 0);
    const targetIdx = currentSelected < channels.length ? currentSelected : 0;

    // Build items with '>' prefix for selected item
    const items = channels.map((ch, idx) => {
      // Create yellow cursor for selected item
      const prefix = idx === targetIdx ? '{yellow-fg}>{/yellow-fg} ' : '  ';

      // Combine prefix, name and unread badge
      // Escape { } in name to prevent blessed tag corruption
      const safeName = ch.type === 'group' ? ch.name : ch.name.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
      const channelId = ch.channel.id;
      const unreadCount = unreadCounts.get(channelId) || 0;
      const unreadStr = unreadCount > 0 ? ` {red-fg}(${unreadCount} New){/red-fg}` : '';

      return `${prefix}${safeName}${unreadStr}`;
    });

    // Update items directly to preserve scroll state
    threadList.setItems(items);

    if (items.length > 0) {
      if (targetIdx >= 0 && targetIdx < items.length) {
        threadList.select(targetIdx);
        // Ensure the selected item is visible (autoscroll)
        threadList.scrollTo(targetIdx);
      }
    }

    screen.render();

    // Manually move cursor to the end of the selected item's text
    if (items.length > 0 && targetIdx >= 0 && targetIdx < items.length) {
      // Get scroll offset (childBase)
      const scrollOffset = threadList.childBase || 0;
      const visibleIndex = targetIdx - scrollOffset;

      // Calculate row relative to screen (top + visible index)
      // Check if item is within visible area
      if (visibleIndex >= 0 && visibleIndex < threadList.height) {
        const row = (threadList.top || 0) + visibleIndex;

        // Calculate col based on stripped text length
        const rawText = items[targetIdx];
        // Simple regex to strip tags like {yellow-fg} and {/yellow-fg}
        const cleanText = rawText.replace(/\{[^}]+\}/g, '');
        const col = (threadList.left || 0) + cleanText.length;

        screen.program.cup(row, col);
        screen.program.showCursor();
      }
    }
  }

  // Manual navigation to prevent skipping and ensure smooth scrolling
  threadList.on('keypress', (ch, key) => {
    if (key.name === 'down' || key.name === 'j') {
      if (threadList.selected < threadList.items.length - 1) {
        updateThreadList(threadList.selected + 1);
      }
      return false;
    } else if (key.name === 'up' || key.name === 'k') {
      if (threadList.selected > 0) {
        updateThreadList(threadList.selected - 1);
      }
      return false;
    } else if (key.name === 'enter') {
      const selectedIndex = threadList.selected;
      const selectedItem = threadList.items[selectedIndex];
      threadList.emit('select', selectedItem, selectedIndex);
      return false;
    }
  });

  threadList.on('select', async (item, index) => {
    selectedIndex = index;
    const selectedChannel = channels[index];
    if (selectedChannel) {
      currentChannel = selectedChannel.channel;

      // Clear unread count for this channel
      unreadCounts.set(currentChannel.id, 0);
      updateThreadList();

      const channelName = selectedChannel.name;
      header.setContent(`clicord (• Live) / Chat with ${client.user.username} | ${channelName}`);

      await loadChannelMessages(currentChannel);
      switchMode('chat');
    }
  });

  client.once('ready', async () => {
    const statusText = `clicord (• Live) / Chat with ${client.user.username}`;
    header.setContent(statusText);

    switchMode('threads');

    channels = [];

    try {
      const allChannels = client.channels.cache;

      for (const channel of allChannels.values()) {
        try {
          const channelType = channel.type;
          const constructorName = channel.constructor?.name || '';
          const hasGuild = !!channel.guild;
          const hasRecipients = !!(channel.recipients && channel.recipients.size > 0);
          const hasRecipient = !!channel.recipient;

          // Check for Group DM first (multiple recipients)
          if (channelType === 3 ||
            channelType === 'GROUP_DM' ||
            channelType === 'group' ||
            constructorName === 'GroupDMChannel' ||
            (hasRecipients && channel.recipients.size > 1)) {
            // Try to get the actual group name, fallback to listing members
            let groupName = channel.name;
            if (!groupName && channel.recipients) {
              // If no group name set, create from member names
              const memberNames = channel.recipients.map(r => formatAuthor(r)).slice(0, 3);
              groupName = memberNames.join(', ');
              if (channel.recipients.size > 3) groupName += '...';
            }
            groupName = groupName || 'Group DM';

            channels.push({
              channel,
              name: `👥 ${groupName}`,
              type: 'group'
            });
          }
          // Single DM (one recipient)
          else if (channelType === 1 ||
            channelType === 'DM' ||
            channelType === 'dm' ||
            constructorName === 'DMChannel' ||
            (hasRecipient && !hasGuild)) {
            let recipientName = 'Unknown';
            const recipient = channel.recipient || (channel.recipients && channel.recipients.first());
            if (recipient) {
              const statusEmoji = getStatusEmoji(recipient);
              recipientName = `${statusEmoji} ${formatAuthor(recipient)}`;
            }

            channels.push({
              channel,
              name: recipientName,
              type: 'dm'
            });
          }
        } catch (error) {
          // Kanal işlenemezse devam et
        }
      }

      updateThreadList();

    } catch (error) {
      // Hata durumunda
    }
  });

  client.on('messageCreate', (message) => {
    try {
      // Increment notification for messages from others
      if (message.author.id !== client.user.id) {
        const channelId = message.channel.id;
        const currentCount = unreadCounts.get(channelId) || 0;

        // Only increment if we are NOT currently looking at this channel in chat mode
        const isCurrentChannel = currentChannel && currentChannel.id === channelId && mode === 'chat';

        if (!isCurrentChannel) {
          unreadCounts.set(channelId, currentCount + 1);

          if (mode === 'threads') {
            updateThreadList();
          }
        }
      }

      if (currentChannel && message.channel.id === currentChannel.id && mode === 'chat') {
        const isOwnMessage = message.author.id === client.user.id;

        // Skip if we've already added this message manually
        if (messageMap.has(message.id) || (isOwnMessage && sentMessageIds.has(message.id))) {
          return;
        }

        // Check for stickers
        const hasSticker = message.stickers && message.stickers.size > 0;
        let stickerUrl = null;
        let stickerName = null;

        if (hasSticker) {
          const sticker = message.stickers.first();
          stickerUrl = sticker.url || (sticker.format === 1 ? `https://media.discordapp.net/stickers/${sticker.id}.png` : null);
          stickerName = sticker.name || 'Unknown Sticker';
        }

        const hasImage = message.attachments && message.attachments.size > 0;
        const replyTo = message.reference?.messageId || null;

        let imageUrl = null;
        let fileName = null;
        if (hasImage) {
          const attachment = message.attachments.first();
          imageUrl = attachment?.url || null;
          fileName = attachment?.name || null;
        }

        let content = message.content || '';

        // Handle system messages if content is empty
        if (!content && !hasSticker && message.type !== 'DEFAULT' && message.type !== 'REPLY') {
          content = getSystemMessageEventText(message);
        }

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
          formatAuthor(message.author),
          content,
          message.createdTimestamp,
          hasImage,
          isOwnMessage,
          message.id,
          replyTo,
          hasSticker ? stickerUrl : imageUrl,
          fileName,
          hasSticker,
          stickerName
        );

        setImmediate(() => {
          messageList.setScrollPerc(100);
          screen.render();
        });
      }
    } catch (error) {
      console.error('messageCreate error:', error);
    }
  });

  client.on('messageDelete', (message) => {
    try {
      if (currentChannel && message.channel.id === currentChannel.id && mode === 'chat') {
        if (message.id && messageMap.has(message.id)) {
          deletedMessageIds.add(message.id);
          renderAllMessages();
        }
      }
    } catch (error) {
      console.error('messageDelete error:', error);
    }
  });

  client.on('messageUpdate', (oldMessage, newMessage) => {
    try {
      if (currentChannel && newMessage.channel.id === currentChannel.id && mode === 'chat') {
        if (newMessage.id && messageMap.has(newMessage.id)) {
          const msgObj = messageMap.get(newMessage.id);
          let content = newMessage.content || '';

          // Handle system messages if content is empty
          if (!content && newMessage.type !== 'DEFAULT' && newMessage.type !== 'REPLY') {
            content = getSystemMessageEventText(newMessage);
          }

          msgObj.content = content;
          renderAllMessages();
        }
      }
    } catch (error) {
      console.error('messageUpdate error:', error);
    }
  });

  input.on('submit', async (value) => {
    const trimmedValue = (value || '').trim();

    input.clearValue();

    if (!trimmedValue || !currentChannel || mode !== 'chat') {
      input.focus();
      screen.render();
      return;
    }

    try {
      if (trimmedValue.startsWith('/')) {
        const parts = trimmedValue.split(' ');
        const command = parts[0].substring(1).toLowerCase();

        if (command === 'upload' && parts.length >= 2) {
          const filePath = parts.slice(1).join(' ').trim().replace(/^["']|["']$/g, '');

          if (!existsSync(filePath)) {
            addMessage('System', `File not found: ${filePath}`, Date.now());
          } else {
            try {
              addMessage('System', 'Uploading file...', Date.now());

              const sentMessage = await currentChannel.send({
                files: [{
                  attachment: filePath,
                  name: basename(filePath)
                }]
              });

              sentMessageIds.add(sentMessage.id);
              const hasImage = sentMessage.attachments && sentMessage.attachments.size > 0;
              let imageUrl = null;
              let fileName = null;
              if (hasImage) {
                const attachment = sentMessage.attachments.first();
                imageUrl = attachment?.url || null;
                fileName = attachment?.name || null;
              }

              addMessage(client.user.username, '', sentMessage.createdTimestamp, hasImage, true, sentMessage.id, null, imageUrl, fileName);
            } catch (error) {
              addMessage('System', `Error uploading file: ${error.message}`, Date.now());
            }
          }
        }
        else if (command === 'upload') {
          addMessage('System', 'Usage: /upload <file_path>', Date.now());
        }
        else if (command === 'view' && parts.length >= 2) {
          const shortId = parts[1];

          let foundFileInfo = null;
          for (const [msgId, fileInfo] of messageFiles.entries()) {
            if (msgId.startsWith(shortId)) {
              foundFileInfo = fileInfo;
              break;
            }
          }

          if (foundFileInfo) {
            const fileUrl = typeof foundFileInfo === 'string' ? foundFileInfo : foundFileInfo.url;
            const fileName = typeof foundFileInfo === 'object' ? foundFileInfo.fileName : null;
            openFileInBrowser(fileUrl, fileName);
            addMessage('System', 'Opening file in browser...', Date.now());
          } else {
            addMessage('System', `File not found. ID: ${shortId}`, Date.now());
          }
        }
        else if (command === 'view') {
          addMessage('System', 'Usage: /view <message_id>', Date.now());
        }
        else if (command === 'reply' && parts.length >= 3) {
          const replyToId = parts[1];
          const replyContent = parts.slice(2).join(' ');

          const sentMessage = await currentChannel.send({
            content: replyContent,
            reply: { messageReference: replyToId }
          });

          sentMessageIds.add(sentMessage.id);
          addMessage(client.user.username, replyContent, sentMessage.createdTimestamp, false, true, sentMessage.id, replyToId);
          replyToMessageId = null;
        }
        else if (command === 'reply') {
          addMessage('System', 'Usage: /reply <message_id> <message>', Date.now());
        }
        else if (command === 'r' && parts.length >= 3) {
          const replyToId = parts[1];
          const replyContent = parts.slice(2).join(' ');

          const sentMessage = await currentChannel.send({
            content: replyContent,
            reply: { messageReference: replyToId }
          });

          sentMessageIds.add(sentMessage.id);
          addMessage(client.user.username, replyContent, sentMessage.createdTimestamp, false, true, sentMessage.id, replyToId);
          replyToMessageId = null;
        }
        else if (command === 'r') {
          addMessage('System', 'Usage: /r <message_id> <message>', Date.now());
        }
        else if (command === 'delete' && parts.length >= 2) {
          const messageId = parts[1];

          try {
            const message = await currentChannel.messages.fetch(messageId);

            if (message.author.id === client.user.id) {
              await message.delete();
              addMessage('System', `Message deleted: ${messageId}`, Date.now());
            } else {
              addMessage('System', 'You can only delete your own messages.', Date.now());
            }
          } catch (error) {
            if (error.code === 10008) {
              addMessage('System', `Message not found: ${messageId}`, Date.now());
            } else {
              addMessage('System', `Error deleting message: ${error.message}`, Date.now());
            }
          }
        }
        else if (command === 'delete') {
          addMessage('System', 'Usage: /delete <message_id>', Date.now());
        }
        else if (command === 'edit' && parts.length >= 3) {
          const messageId = parts[1];
          const newContent = parts.slice(2).join(' ');

          try {
            const message = await currentChannel.messages.fetch(messageId);

            if (message.author.id === client.user.id) {
              await message.edit(newContent);
              addMessage('System', `Message edited: ${messageId}`, Date.now());

              if (messageMap.has(messageId)) {
                const msgObj = messageMap.get(messageId);
                msgObj.content = newContent;
                renderAllMessages();
              }
            } else {
              addMessage('System', 'You can only edit your own messages.', Date.now());
            }
          } catch (error) {
            if (error.code === 10008) {
              addMessage('System', `Message not found: ${messageId}`, Date.now());
            } else {
              addMessage('System', `Error editing message: ${error.message}`, Date.now());
            }
          }
        }
        else if (command === 'edit') {
          addMessage('System', 'Usage: /edit <message_id> <new_message>', Date.now());
        }
        else if (command === 'pin' && parts.length >= 2) {
          const messageId = parts[1];
          try {
            const message = await currentChannel.messages.fetch(messageId);
            await message.pin();
            addMessage('System', `Message pinned: ${messageId}`, Date.now());
          } catch (error) {
            addMessage('System', `Error pinning message: ${error.message}`, Date.now());
          }
        }
        else if (command === 'pin') {
          addMessage('System', 'Usage: /pin <message_id>', Date.now());
        }
        else if (command === 'react' && parts.length >= 3) {
          const messageId = parts[1];
          const emoji = parts[2];
          try {
            const message = await currentChannel.messages.fetch(messageId);
            await message.react(emoji);
            addMessage('System', `Reacted to message ${messageId} with ${emoji}`, Date.now());
          } catch (error) {
            addMessage('System', `Error reacting to message: ${error.message}`, Date.now());
          }
        }
        else if (command === 'react') {
          addMessage('System', 'Usage: /react <message_id> <emoji>', Date.now());
        }
        else if (command === 'help') {
          addMessage('System', 'Commands:\n- /upload <file_path>: Upload file\n- /view <message_id>: Open file/sticker in browser\n- /reply <message_id> <message>: Reply to message\n- /r <message_id> <message>: Reply to message (short)\n- /delete <message_id>: Delete message\n- /edit <message_id> <new_message>: Edit message\n- /pin <message_id>: Pin message\n- /react <message_id> <emoji>: React to message', Date.now());
        }
        else {
          addMessage('System', `Unknown command: ${command}. Use /help for help.`, Date.now());
        }
      } else {
        const sentMessage = await currentChannel.send(trimmedValue);

        // Mark as sent to prevent duplicate from messageCreate event
        sentMessageIds.add(sentMessage.id);
        addMessage(client.user.username, trimmedValue, sentMessage.createdTimestamp, false, true, sentMessage.id, replyToMessageId);
        replyToMessageId = null;
      }
    } catch (error) {
      addMessage('System', `Error: ${error.message}`, Date.now());
    }

    setImmediate(() => {
      messageList.setScrollPerc(100);
      input.focus();
      screen.render();
    });
  });

  input.on('keypress', () => {
    screen.render();
  });

  input.key(['C-d'], () => {
    if (mode === 'chat') {
      input.clearValue();
      input.focus();
      screen.render();
    }
  });


  screen.key(['escape'], () => {
    if (mode === 'chat') {
      switchMode('threads');
      updateThreadList();
    } else {
      return process.exit(0);
    }
  });


  try {
    await client.login(token);
  } catch (error) {
    console.error(chalk.red(`Bağlantı hatası: ${error.message}`));
    process.exit(1);
  }

  screen.render();
}
