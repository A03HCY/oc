function back_home() {
    window.location.href = './home.html?tab=chat';
}

document.addEventListener('DOMContentLoaded', async () => {
    await DB.init();
    
    // 获取DOM元素
    const nameField = document.getElementById('name');
    const personaSelector = document.getElementById('persona');
    const modeSelector = document.getElementById('mode');
    const createButton = document.querySelector('s-button');
    const backButton = document.querySelector('s-icon-button[slot="navigation"]');
    
    // 从数据库加载persona列表
    async function loadPersonaList() {
        try {
            // 清空当前选项
            personaSelector.innerHTML = '';
            
            // 获取所有persona
            const personas = await DB.getAllPersonas();
            
            if (personas.length === 0) {
                // 如果没有persona，添加提示选项
                const emptyItem = document.createElement('s-picker-item');
                emptyItem.value = '';
                emptyItem.textContent = '暂无角色，请先创建角色';
                emptyItem.disabled = true;
                personaSelector.appendChild(emptyItem);
            } else {
                // 添加persona选项
                personas.forEach(persona => {
                    const item = document.createElement('s-picker-item');
                    item.value = persona.name;
                    item.textContent = persona.name;
                    personaSelector.appendChild(item);
                });
                
                // 默认选择第一个
                if (personas.length > 0) {
                    personaSelector.value = personas[0].name;
                }
            }
        } catch (error) {
            console.error('加载persona列表失败:', error);
        }
    }
    
    // 加载模型列表
    async function loadModelList() {
        try {
            // 清空当前选项
            modeSelector.innerHTML = '';
            
            // 尝试从model.json加载模型配置
            try {
                const response = await fetch('./model.json');
                if (response.ok) {
                    const models = await response.json();
                    
                    // 添加从JSON加载的模型选项
                    for (const [name, id] of Object.entries(models)) {
                        const item = document.createElement('s-picker-item');
                        item.value = id;
                        item.textContent = name;
                        modeSelector.appendChild(item);
                    }
                    
                    // 如果有模型，默认选择第一个
                    if (Object.keys(models).length > 0) {
                        modeSelector.value = Object.values(models)[0];
                        return;
                    }
                }
            } catch (error) {
                console.error('加载model.json失败:', error);
            }
            
            // 如果从JSON加载失败，从数据库加载或使用默认模型
            const storedModels = await DB.getModels();
            
            if (storedModels.length === 0) {
                // 如果没有model，添加一些默认选项
                const defaultModels = [
                    { id: 'deepseek-v3', name: 'DeepSeek-V3' },
                    { id: 'gemini-1.5-pro', name: 'Gemini Pro' },
                    { id: 'qwen-max-latest', name: 'Qwen Max' }
                ];
                
                defaultModels.forEach(model => {
                    const item = document.createElement('s-picker-item');
                    item.value = model.id;
                    item.textContent = model.name;
                    modeSelector.appendChild(item);
                });
                
                // 保存默认model到数据库
                await DB.saveModels(defaultModels);
                
                // 默认选择第一个
                modeSelector.value = defaultModels[0].id;
            } else {
                // 添加model选项
                storedModels.forEach(model => {
                    const item = document.createElement('s-picker-item');
                    item.value = model.id;
                    item.textContent = model.name;
                    modeSelector.appendChild(item);
                });
                
                // 默认选择第一个
                if (storedModels.length > 0) {
                    modeSelector.value = storedModels[0].id;
                }
            }
        } catch (error) {
            console.error('加载model列表失败:', error);
        }
    }
    
    // 加载数据
    await loadPersonaList();
    await loadModelList();
    
    // 返回按钮点击事件
    backButton.addEventListener('click', () => {
        back_home();
    });
    
    // 创建按钮点击事件
    createButton.addEventListener('click', async () => {
        const name = nameField.value.trim();
        const selectedPersona = personaSelector.value;
        const selectedModel = modeSelector.value;
        
        // 验证输入
        if (!name) {
            alert('请输入聊天名称');
            return;
        }
        
        if (!selectedPersona) {
            alert('请选择角色');
            return;
        }
        
        if (!selectedModel) {
            alert('请选择模型');
            return;
        }
        
        // 创建聊天对象
        const chatData = {
            title: name,
            persona: selectedPersona,
            model: selectedModel,
            history: [] // 初始空聊天记录
        };
        
        try {
            // 保存到数据库
            const chatId = await DB.createChat(chatData);
            
            // 创建成功，跳转到聊天页面
            window.location.href = `./chat.html?id=${chatId}`;
        } catch (error) {
            console.error('创建聊天失败:', error);
            alert('创建聊天失败: ' + error.message);
        }
    });
});