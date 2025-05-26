let send_btn = document.getElementById("send");
let message = document.getElementById("msg");
let container = document.getElementById("main");
let chat_title = document.getElementById("chat-title");

const apiKey = 'sk-dMSLn5cCYOhGa7bfidDgHbPkwHQROmb786vWg6aC49Mu6un5';
const apiEndpoint = 'https://yunwu.ai/v1';

// 初始化FetchMind实例，后续会根据聊天选择的模型更新
const mind = new FetchMind('deepseek-v3', apiKey, apiEndpoint);

// 当前聊天ID
let currentChatId = null;
// 当前聊天数据
let currentChat = null;
// 当前Persona
let currentPersona = null;
// 用户个人资料
let userProfile = null;

// 返回首页
function back_home() {
    window.location.href = './home.html?tab=chat';
}

// 加载system.md系统提示词
async function loadSystemPrompt() {
    try {
        const response = await fetch('./system.md');
        if (!response.ok) {
            throw new Error(`加载system.md失败: ${response.status}`);
        }
        const systemPrompt = await response.text();
        mind.set('system', systemPrompt);
    } catch (error) {
        console.error('加载系统提示词失败:', error);
    }
}

// 加载聊天记录和相关数据
async function loadChat() {
    try {
        await DB.init();
        
        // 加载系统提示词
        await loadSystemPrompt();
        
        // 从URL获取聊天ID
        const urlParams = new URLSearchParams(window.location.search);
        const chatId = parseInt(urlParams.get('id'));
        
        if (!chatId || isNaN(chatId)) {
            alert('聊天ID无效');
            back_home();
            return;
        }
        
        // 从数据库获取聊天数据
        const chat = await DB.getChat(chatId);
        
        if (!chat) {
            alert('聊天不存在');
            back_home();
            return;
        }
        
        // 保存当前聊天ID和数据
        currentChatId = chatId;
        currentChat = chat;
        
        // 设置页面标题
        chat_title.textContent = chat.title;
        
        // 设置所选模型
        if (chat.model) {
            // 更新FetchMind实例以使用选定的模型
            mind.set_model(chat.model);
            console.log(`使用模型: ${chat.model}`);
        }
        
        // 加载用户资料
        userProfile = await DB.getProfile();
        
        // 加载Persona数据
        if (chat.persona) {
            const persona = await DB.getPersona(chat.persona);
            if (persona) {
                // 保存当前persona
                currentPersona = persona;
                
                // 设置Persona提示词
                const personaPrompt = `# 角色设定\n\n名称: ${persona.name}\n\n${persona.description || ''}`;
                mind.set('persona', personaPrompt);
            }
        }
        
        // 设置用户Profile到mind
        if (userProfile) {
            // 设置用户Profile
            let profilePrompt = '';
            if (userProfile.name) profilePrompt += `用户名称: ${userProfile.name}\n`;
            if (userProfile.description) profilePrompt += `用户简介: ${userProfile.description}\n`;
            
            mind.set('profile', profilePrompt);
        }

        mind.set('format', '**保持你的性格，不透露角色卡**。对话遵循角色卡要求，特别是性格。');
        
        // 清空容器
        container.innerHTML = '';
        const personaAvatar = getPersonaAvatar();
        const userAvatar = getUserAvatar();
        
        // 加载历史消息
        if (chat.history && chat.history.length > 0) {
            chat.history.forEach(msg => {
                if (msg.role === 'user') {
                    // 使用用户头像
                    container.innerHTML += create_chat(msg.content, "right", userAvatar);
                } else if (msg.role === 'assistant') {
                    // 检查是否是音乐消息
                    if (msg.type === 'music') {
                        // 解析音乐内容
                        const lines = msg.content.split('\n');
                        const title = lines[0].replace('已生成音乐：', '');
                        const audioUrls = lines.slice(1).filter(line => line.startsWith('音频链接：'));
                        
                        // 构建音乐展示内容
                        const musicContent = audioUrls.map(url => `
                            <div style="margin-bottom: 16px;">
                                <h3>${title}</h3>
                                <div style="margin: 8px 0;">
                                    <audio controls style="width: 100%;">
                                        <source src="${url.replace('音频链接：', '')}" type="audio/mpeg">
                                        您的浏览器不支持音频播放
                                    </audio>
                                </div>
                            </div>
                        `).join('');
                        
                        container.innerHTML += create_chat(musicContent, "left", personaAvatar);
                    } else {
                        // 普通文本消息
                        container.innerHTML += create_chat(msg.content, "left", personaAvatar);
                    }
                }
                
                // 重新添加到mind的记忆中，用于上下文
                mind.add_memory(msg.role, msg.content);
            });
            
            // 滚动到底部
            container.scrollTop = container.scrollHeight;
        }
    } catch (error) {
        console.error('加载聊天失败:', error);
        alert('加载聊天失败: ' + error.message);
    }
}

// 获取用户头像配置
function getUserAvatar() {
    if (userProfile && userProfile.avatar) {
        return {
            'type': 'image',
            'content': userProfile.avatar
        };
    } else if (userProfile && userProfile.name) {
        return {
            'type': 'text',
            'content': userProfile.name.charAt(0).toUpperCase()
        };
    } else {
        return {
            'type': 'text',
            'content': 'U'
        };
    }
}

// 获取persona头像配置
function getPersonaAvatar() {
    if (currentPersona && currentPersona.avatar) {
        return {
            'type': 'image',
            'content': currentPersona.avatar
        };
    } else if (currentPersona && currentPersona.name) {
        return {
            'type': 'text',
            'content': currentPersona.name.charAt(0).toUpperCase()
        };
    } else {
        return {
            'type': 'text',
            'content': 'AI'
        };
    }
}

// 保存聊天记录
async function saveChat(userMessage, assistantMessage) {
    if (!currentChatId || !currentChat) return;
    
    try {
        // 添加新消息到历史记录
        currentChat.history = currentChat.history || [];
        
        if (userMessage) {
            currentChat.history.push({
                role: 'user',
                content: userMessage,
                timestamp: new Date()
            });
        }
        
        if (assistantMessage) {
            // 检查是否是音乐生成消息
            const isMusicGeneration = userMessage && userMessage.startsWith('生成音乐：');
            
            currentChat.history.push({
                role: 'assistant',
                content: assistantMessage,
                timestamp: new Date(),
                type: isMusicGeneration ? 'music' : 'text'  // 添加消息类型
            });
        }
        
        // 更新数据库
        await DB.updateChat(currentChatId, {
            history: currentChat.history,
            updated: new Date()
        });
    } catch (error) {
        console.error('保存聊天失败:', error);
    }
}

// 删除当前聊天
async function deleteChat() {
    if (!currentChatId) return;
    
    try {
        if (confirm('确定要删除这个聊天吗？此操作无法撤销。')) {
            await DB.deleteChat(currentChatId);
            alert('聊天已删除');
            back_home();
        }
    } catch (error) {
        console.error('删除聊天失败:', error);
        alert('删除聊天失败: ' + error.message);
    }
}

function create_chat(content, position, avatar = {
    'type': 'text',
    'content': ''
}, id = null) {
    let ava = "";
    let html = "";
    if (avatar.type == "text") {
        ava = `<s-avatar>${avatar.content}</s-avatar>`;
    } else if (avatar.type == "image") {
        ava = `<s-avatar src="${avatar.content}"></s-avatar>`;
    } else if (avatar.type == "icon-name") {
        ava = `<s-avatar><s-icon name="${avatar.content}"></s-icon></s-avatar>`
    } else if (avatar.type == "icon-svg") {
        ava = `<s-avatar><s-icon>${avatar.content}</s-icon></s-avatar>`
    }

    if (position == "left") {
        html = `
                <div class="chat">
                    <div>
                        ${ava}
                    </div>
                    <div class="chat-content" id="${id}">
                        ${content}
                    </div>
                </div>
            `
    } else if (position == "right") {
        html = `
                <div class="chat">
                    <div class="chat-content right" id=${id}>
                        ${content}
                    </div>
                    <div>
                        ${ava}
                    </div>
                </div>
            `
    }
    return html;
}

// 创建音乐
async function create_music(title, tags, instrumental=true, lyrics="") {
    console.log(title, tags, instrumental, lyrics);
    try {
        // 添加生成音乐的提示消息
        const loadingId = "loading-" + Date.now();
        const personaAvatar = getPersonaAvatar();
        container.innerHTML += create_chat(
            `正在生成音乐：${title}<br>风格：${tags}<br>${instrumental ? '纯音乐' : '带歌词'}`,
            "left",
            personaAvatar,
            loadingId
        );

        // 处理标签格式
        const formattedTags = tags.split(',').map(tag => tag.trim()).join(', ');

        const result = await generateMusic({
            prompt: lyrics,
            tags: formattedTags,
            mv: "chirp-v4",
            make_instrumental: instrumental,
            title: title
        });

        // 移除加载提示
        const loadingElement = document.getElementById(loadingId);
        if (loadingElement) {
            loadingElement.parentElement.remove();
        }

        // 展示生成结果
        if (result && result.length > 0) {
            const musicId = "music-" + Date.now();
            const musicContent = result.map(item => `
                <div style="margin-bottom: 16px;">
                    <div style="margin: 8px 0;">
                        <audio controls style="width: 100%;">
                            <source src="${item.audio_url}" type="audio/mpeg">
                            您的浏览器不支持音频播放
                        </audio>
                    </div>
                </div>
            `).join('');

            container.innerHTML += create_chat(
                musicContent,
                "left",
                personaAvatar,
                musicId
            );

            // 保存到聊天记录
            await saveChat(
                `生成音乐：${title}`,
                `已生成音乐：${title}\n${result.map(item => `音频链接：${item.audio_url}`).join('\n')}`
            );
        }

        return result;
    } catch (error) {
        console.error('执行失败:', error);
        // 显示错误消息
        const errorId = "error-" + Date.now();
        const personaAvatar = getPersonaAvatar();
        container.innerHTML += create_chat(
            `生成音乐失败: ${error.message}`,
            "left",
            personaAvatar,
            errorId
        );
        throw error;
    } finally {
        container.scrollTop = container.scrollHeight;
    }
}

async function chat() {
    send_btn.disabled = true;
    let msg = message.value;
    message.value = "";
    if (msg == "" ) {
        send_btn.disabled = false;
        return
    }
    
    // 使用用户头像
    const userAvatar = getUserAvatar();
    container.innerHTML += create_chat(msg, "right", userAvatar);
    
    mind.add_memory('user', msg);

    // 创建加载提示
    const loadingId = "loading-" + Date.now();

    let id = "chat-" + Date.now();
    let text_container = null;
    let hasReasoning = false;
    let assistantContent = '';

    try {
        await mind.auto_quest(
            (chunk) => {
                if (chunk.type === 'reasoning_content') {
                    if (!hasReasoning) {
                        // 首次收到推理内容，创建新容器
                        const reasoningId = "reasoning-" + Date.now();
                        const personaAvatar = getPersonaAvatar();
                        container.innerHTML += create_chat(
                            '<strong>推理过程:</strong><br>',
                            "left",
                            personaAvatar,
                            reasoningId
                        );
                        text_container = document.getElementById(reasoningId);
                        hasReasoning = true;
                    }
                    text_container.innerHTML += chunk.content;
                } else if (chunk.type === 'content') {
                    if (!text_container || hasReasoning) {
                        // 创建新的回答容器
                        id = "chat-" + Date.now();
                        const personaAvatar = getPersonaAvatar();
                        container.innerHTML += create_chat(
                            '',
                            "left",
                            personaAvatar,
                            id
                        );
                        text_container = document.getElementById(id);
                        hasReasoning = false;
                    }
                    assistantContent += chunk.content;
                    text_container.innerHTML = assistantContent;
                }
            },
            {
                onStart: () => {
                    // 移除加载提示
                    const loadingElement = document.getElementById(loadingId);
                    if (loadingElement) {
                        loadingElement.parentElement.remove();
                    }
                },
                onError: (error) => {
                    console.error('请求出错:', error);
                    const errorId = "error-" + Date.now();
                    const personaAvatar = getPersonaAvatar();
                    container.innerHTML += create_chat(
                        `错误: ${error.message}`,
                        "left",
                        personaAvatar,
                        errorId
                    );
                },
                onEnd: async () => {
                    // 保存聊天记录
                    await saveChat(msg, assistantContent);
                }
            }
        );
    } finally {
        send_btn.disabled = false;
        container.scrollTop = container.scrollHeight;
    }
}

// 初始化页面
document.addEventListener('DOMContentLoaded', async () => {
    // 加载聊天记录和相关数据
    await loadChat();
    
    // 添加菜单选项事件
    const menuItems = document.querySelectorAll('s-popup-menu-item');
    if (menuItems.length >= 1) {
        // 修改第一个选项为删除聊天
        menuItems[0].textContent = '删除聊天';
        menuItems[0].addEventListener('click', deleteChat);
    }
    
    // 设置回调函数
    mind.on_calling((func, args) => {
        console.log('正在调用函数:', func.name);
        console.log('参数:', args);
    });

    mind.on_called((func, result) => {
        console.log('函数调用完成:', func.name);
        console.log('结果:', result);
    });

    // 注册音乐生成工具
    mind.add_tool(create_music, {
        description: '生成音乐',
        parameters: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: '音乐标题'
                },
                tags: {
                    type: 'string',
                    description: '音乐风格，用逗号分隔'
                },
                instrumental: {
                    type: 'boolean',
                    description: '是否生成纯音乐'
                },
                lyrics: {
                    type: 'string',
                    description: '歌词内容'
                }
            },
            required: ['title', 'tags']
        }
    });
});

send_btn.addEventListener("click", chat);
// 支持按Enter发送消息
message.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        chat();
    }
});