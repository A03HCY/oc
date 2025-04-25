let chat = document.querySelector('.chat');
let persona = document.querySelector('.persona');
let profile = document.querySelector('.profile');

let chat_btn = document.querySelector('#chat');
let persona_btn = document.querySelector('#persona');
let profile_btn = document.querySelector('#profile');
let new_persona_btn = document.querySelector('#new-persona-btn');
let new_chat_btn = document.querySelector('#new-chat-btn');
let load_persona_btn = document.querySelector('#load-persona-btn');

function switch_page(page) {
    if (page === 'chat') {
        chat.classList.remove('hidden');
        persona.classList.add('hidden');
        profile.classList.add('hidden');
        chat_btn.selected = true;
        persona_btn.selected = false;
        profile_btn.selected = false;
    } else if (page === 'persona') {
        chat.classList.add('hidden');
        persona.classList.remove('hidden');
        profile.classList.add('hidden');
        chat_btn.selected = false;
        persona_btn.selected = true;
        profile_btn.selected = false;
    } else if (page === 'profile') {
        chat.classList.add('hidden');
        persona.classList.add('hidden');
        profile.classList.remove('hidden');
        chat_btn.selected = false;
        persona_btn.selected = false;
        profile_btn.selected = true;
    }
}

load_persona_btn.addEventListener('click', () => {
    window.location.href = './load.html';
});

chat_btn.addEventListener('click', () => {
    switch_page('chat');
});

persona_btn.addEventListener('click', () => {
    switch_page('persona');
});

profile_btn.addEventListener('click', () => {
    switch_page('profile');
});

new_persona_btn.addEventListener('click', () => {
    window.location.href = './persona.html';
});

new_chat_btn.addEventListener('click', () => {
    window.location.href = './create_chat.html';
});


// 加载persona列表
async function loadPersonaList() {
    const personaListElement = document.getElementById('persona-list');

    // 清空现有列表
    personaListElement.innerHTML = '';

    try {
        // 从数据库获取所有persona
        const personas = await DB.getAllPersonas();

        if (personas.length === 0) {
            // 如果没有persona，显示提示信息
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.innerHTML = '<s-empty>暂时没有数据</s-empty>';
            personaListElement.appendChild(emptyMessage);
            return;
        }

        // 遍历创建列表项
        personas.forEach(persona => {
            const itemElement = document.createElement('s-ripple');
            itemElement.className = 'list-item';

            // 创建头像
            const avatarElement = document.createElement('s-avatar');
            if (persona.avatar) {
                avatarElement.src = persona.avatar;
            } else if (persona.name) {
                // 如果没有头像，使用名称首字母
                avatarElement.textContent = persona.name.charAt(0).toUpperCase();
            }

            // 创建名称
            const nameElement = document.createElement('h4');
            nameElement.textContent = persona.name;

            // 添加到列表项
            itemElement.appendChild(avatarElement);
            itemElement.appendChild(nameElement);

            // 添加点击事件，跳转到编辑页面
            itemElement.addEventListener('click', () => {
                window.location.href = `persona.html?name=${encodeURIComponent(persona.name)}`;
            });

            // 添加到列表
            personaListElement.appendChild(itemElement);
        });
    } catch (error) {
        console.error('加载persona列表失败:', error);
    }
}
// 加载聊天列表
async function loadChatList() {
    const chatListElement = document.getElementById('chat-list');

    // 清空现有列表
    chatListElement.innerHTML = '';

    try {
        // 从数据库查询聊天列表
        const chats = await DB.queryChats();

        if (chats.data.length === 0) {
            // 如果没有聊天，显示提示信息
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.innerHTML = '<s-empty>暂时没有聊天</s-empty>';
            chatListElement.appendChild(emptyMessage);
            return;
        }

        // 预先获取所有persona数据便于查找
        const personas = await DB.getAllPersonas();
        const personaMap = {};
        personas.forEach(persona => {
            personaMap[persona.name] = persona;
        });

        // 遍历创建列表项
        chats.data.forEach(chat => {
            const itemElement = document.createElement('s-ripple');
            itemElement.className = 'list-item';

            // 创建头像
            const avatarElement = document.createElement('s-avatar');

            // 如果聊天关联了persona，尝试使用persona的头像
            if (chat.persona && personaMap[chat.persona]) {
                const persona = personaMap[chat.persona];
                if (persona.avatar) {
                    // 使用persona的头像
                    avatarElement.src = persona.avatar;
                } else {
                    // 如果persona没有头像，使用persona名字的首字母
                    avatarElement.textContent = persona.name.charAt(0).toUpperCase();
                }
            } else {
                // 如果没有关联persona或找不到persona，使用聊天标题的首字母
                avatarElement.textContent = chat.title.charAt(0).toUpperCase();
            }

            // 创建标题
            const titleElement = document.createElement('h4');
            titleElement.textContent = chat.title;

            // 添加到列表项
            itemElement.appendChild(avatarElement);
            itemElement.appendChild(titleElement);

            // 添加点击事件，跳转到聊天页面
            itemElement.addEventListener('click', () => {
                window.location.href = `chat.html?id=${chat.id}`;
            });

            // 添加到列表
            chatListElement.appendChild(itemElement);
        });
    } catch (error) {
        console.error('加载聊天列表失败:', error);
    }
}

// 加载Profile资料
async function loadProfile() {
    try {
        // 获取Profile元素
        const profileAvatar = document.getElementById('profile-avatar');
        const profileName = document.getElementById('profile-name');
        const profileDescription = document.getElementById('description');
        const saveButton = document.getElementById('save-profile-btn');
        const changeAvatarButton = document.getElementById('change-avatar-btn');

        // 从数据库获取Profile
        const profile = await DB.getProfile();

        // 填充数据到输入框
        if (profile) {
            if (profile.name) profileName.value = profile.name;
            if (profile.description) profileDescription.value = profile.description;
            if (profile.avatar) profileAvatar.src = profile.avatar;
        }

        // 添加更换头像按钮点击事件
        if (changeAvatarButton) {
            changeAvatarButton.addEventListener('click', async () => {
                try {
                    // 方式1：选择本地图片
                    const base64 = await DB.selectAndConvertImage();
                    if (base64) {
                        profileAvatar.src = base64;
                    }
                } catch (error) {
                    console.error('选择头像失败:', error);
                    // 方式2：生成随机颜色头像作为备选
                    const randomAvatar = DB.generateColorAvatar(profileName.value || '');
                    profileAvatar.src = randomAvatar;
                }
            });
        }

        // 添加保存按钮点击事件
        if (saveButton) {
            saveButton.addEventListener('click', async () => {
                try {
                    const name = profileName.value.trim();
                    const description = profileDescription.value.trim();

                    // 保存到数据库
                    await DB.saveProfile({
                        name: name,
                        description: description,
                        avatar: profileAvatar.src || null,
                        updated: new Date()
                    });

                    alert('个人资料已保存');
                } catch (error) {
                    console.error('保存个人资料失败:', error);
                    alert('保存失败: ' + error.message);
                }
            });
        }
    } catch (error) {
        console.error('加载个人资料失败:', error);
    }
}

const urlParams = new URLSearchParams(window.location.search);
const tab = urlParams.get('tab');

if (tab === 'persona') {
    switch_page('persona');
} else if (tab === 'profile') {
    switch_page('profile');
} else {
    switch_page('chat');
}

// 添加按钮点击事件
document.addEventListener('DOMContentLoaded', () => {
    // 初始化数据库
    DB.init().then(() => {
        // 加载persona列表
        loadPersonaList();
        loadChatList();
        loadProfile();
    });

    // 为添加按钮添加点击事件
    const addButton = document.querySelector('.persona .fab');
    if (addButton) {
        addButton.addEventListener('click', () => {
            window.location.href = 'persona.html';
        });
    }

    persona_btn.addEventListener('click', () => {
        loadPersonaList();
    });
    chat_btn.addEventListener('click', () => {
        loadChatList();
    });
    profile_btn.addEventListener('click', () => {
        loadProfile();
    });
});