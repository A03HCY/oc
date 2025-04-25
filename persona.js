// persona.js
function back_home() {
    window.location.href = './home.html?tab=persona';
}


document.addEventListener('DOMContentLoaded', async () => {
    await DB.init();

    // 从URL获取UUID参数
    const urlParams = new URLSearchParams(window.location.search);
    const personaName = urlParams.get('name');

    // 获取DOM元素
    const appbarTitle = document.querySelector('s-appbar div[slot="headline"]');
    const nameField = document.getElementById('name');
    const descriptionField = document.getElementById('description');
    const saveButton = document.getElementById('save-btn');
    const deleteButton = document.getElementById('delete-btn');
    const backButton = document.querySelector('s-icon-button[slot="navigation"]');
    const avatar = document.getElementById('avatar');
    const changeAvatarButton = document.querySelector('.avatar-full s-button');

    let currentPersona = null;


    // 检查是创建新的还是编辑现有的
    if (personaName) {
        // 尝试获取现有Persona
        currentPersona = await DB.getPersona(personaName);

        if (currentPersona) {
            appbarTitle.textContent = '编辑人格';
            // 编辑现有Persona
            nameField.value = currentPersona.name;
            nameField.disabled = true; // 名称作为主键不允许修改
            descriptionField.value = currentPersona.description || '';

            // 如果有头像，设置头像
            if (currentPersona.avatar) {
                avatar.src = currentPersona.avatar;
            }

        } else {
            // UUID不存在，转为创建模式
            appbarTitle.textContent = '创建人格';
            // 隐藏删除按钮
            deleteButton.style.display = 'none';
        }
    } else {
        // 创建新的Persona
        appbarTitle.textContent = '创建人格';
        // 隐藏删除按钮
        deleteButton.style.display = 'none';
    }

    // 保存按钮点击事件
    saveButton.addEventListener('click', async () => {
        const name = nameField.value.trim();
        const description = descriptionField.value.trim();

        if (!name) {
            alert('Persona名称不能为空');
            return;
        }

        // 构建Persona对象
        const persona = {
            name,
            description,
            avatar: avatar.src || null,
            created: currentPersona?.created || new Date(),
            updated: new Date()
        };

        // 保存到数据库
        try {
            await DB.addPersona(persona);
            // 保存成功后返回
            back_home();
        } catch (error) {
            console.error('保存Persona失败:', error);
            alert('保存失败: ' + error.message);
        }
    });

    // 删除按钮点击事件
    if (deleteButton) {
        deleteButton.addEventListener('click', async () => {
            if (!currentPersona) return;

            // 确认删除
            if (confirm(`确定要删除角色 "${currentPersona.name}" 吗？此操作将同时删除所有使用该角色的聊天记录。此操作无法撤销。`)) {
                try {
                    // 查询所有使用该persona的聊天
                    const chatsResult = await DB.queryChats({
                        persona: currentPersona.name
                    });

                    // 删除相关聊天
                    const deletePromises = [];
                    if (chatsResult && chatsResult.data && chatsResult.data.length > 0) {
                        // 逐个删除聊天
                        for (const chat of chatsResult.data) {
                            deletePromises.push(DB.deleteChat(chat.id));
                        }

                        // 等待所有删除操作完成
                        await Promise.all(deletePromises);
                        console.log(`已删除 ${chatsResult.data.length} 个相关聊天`);
                    }

                    // 执行删除persona操作
                    await DB.deletePersona(currentPersona.name);
                    alert('删除成功');
                    // 返回首页
                    back_home();
                } catch (error) {
                    console.error('删除Persona失败:', error);
                    alert('删除失败: ' + error.message);
                }
            }
        });
    }

    // 返回按钮点击事件
    backButton.addEventListener('click', () => {
        back_home();
    });

    // 更换头像按钮点击事件
    changeAvatarButton.addEventListener('click', async () => {
        try {
            // 方式1：选择本地图片
            const base64 = await DB.selectAndConvertImage();
            if (base64) {
                avatar.src = base64;
            }
        } catch (error) {
            console.error('选择头像失败:', error);
            // 方式2：生成随机颜色头像作为备选
            const randomAvatar = DB.generateColorAvatar(currentPersona?.name || '');
            avatar.src = randomAvatar;
        }
    });
});