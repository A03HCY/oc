function back_home() {
    window.location.href = 'home.html?tab=persona';
}

// 全局变量
let selectedFile = null;
let parsedData = null;

document.addEventListener('DOMContentLoaded', async () => {
    await DB.init();
    
    // 获取元素
    const backBtn = document.getElementById('back-btn');
    const fileInput = document.getElementById('file-input');
    const fileSelectBtn = document.getElementById('file-select-btn');
    const fileLoadBtn = document.getElementById('file-load-btn');
    const fileDisplay = document.getElementById('file-display');
    const urlInput = document.getElementById('url-input');
    const urlLoadBtn = document.getElementById('url-load-btn');
    
    // 返回按钮点击事件
    backBtn.addEventListener('click', back_home);
    
    // 文件选择按钮点击事件
    fileSelectBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    // 文件选择改变事件
    fileInput.addEventListener('change', (event) => {
        const files = event.target.files;
        if (files.length > 0) {
            selectedFile = files[0];
            fileDisplay.textContent = `已选择: ${selectedFile.name} (${formatFileSize(selectedFile.size)})`;
            fileLoadBtn.disabled = false;
        } else {
            selectedFile = null;
            fileDisplay.textContent = '未选择文件';
            fileLoadBtn.disabled = true;
        }
    });
    
    // 文件加载按钮点击事件
    fileLoadBtn.addEventListener('click', async () => {
        if (!selectedFile) return;
        
        try {
            const fileContent = await readFileAsText(selectedFile);
            await processPersonaJson(fileContent);
        } catch (error) {
            console.error('加载文件失败:', error);
            alert('加载文件失败: ' + error.message);
        }
    });
    
    // URL加载按钮点击事件
    urlLoadBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) {
            alert('请输入有效的URL');
            return;
        }
        
        try {
            await loadPersonaFromUrl(url);
        } catch (error) {
            console.error('从URL加载失败:', error);
            alert('从URL加载失败: ' + error.message);
        }
    });
});

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
}

// 将文件读取为文本
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
}

// 从URL加载Persona
async function loadPersonaFromUrl(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const jsonText = await response.text();
        await processPersonaJson(jsonText);
    } catch (error) {
        console.error('获取URL内容失败:', error);
        throw new Error('获取URL内容失败: ' + error.message);
    }
}

// 处理Persona JSON
async function processPersonaJson(jsonText) {
    try {
        // 解析JSON
        const data = JSON.parse(jsonText);
        
        // 验证JSON结构
        if (!validatePersonaJson(data)) {
            throw new Error('JSON格式不正确，必须包含name和description字段');
        }
        
        // 检查是否已存在同名Persona
        const existingPersona = await DB.getPersona(data.name);
        if (existingPersona) {
            if (!confirm(`已存在名为 "${data.name}" 的角色，是否覆盖？`)) {
                return;
            }
        }
        
        // 保存到数据库
        await DB.addPersona({
            name: data.name,
            description: data.description,
            avatar: data.avatar || null,
            created: new Date(),
            updated: new Date()
        });
        
        alert(`成功加载角色: ${data.name}`);
        back_home();
    } catch (error) {
        console.error('处理JSON失败:', error);
        throw new Error('处理JSON失败: ' + error.message);
    }
}

// 验证Persona JSON格式
function validatePersonaJson(data) {
    // 基本验证：必须包含name和description字段
    if (!data.name || typeof data.name !== 'string') {
        return false;
    }
    
    if (!data.description || typeof data.description !== 'string') {
        return false;
    }
    
    return true;
}