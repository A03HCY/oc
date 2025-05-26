// 配置信息
const config = {
    apiKey: 'sk-gqBb7gEaQ6FNRpGuimJxJCjoEFoyqGqWoxGQM7z1wrF0OACz',
    baseUrl: 'https://yunwu.ai'
};

// 请求头
const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json'
};

/**
 * 提交音乐生成请求
 * @param {Object} options - 生成选项
 * @param {string} [options.prompt] - 提示词
 * @param {string} [options.tags] - 标签
 * @param {string} [options.mv] - 模型版本
 * @param {boolean} [options.make_instrumental] - 是否生成器乐
 * @param {string} [options.title] - 标题
 * @returns {Promise<string>} - 任务ID
 */
async function submitMusic(options = {}) {
    const payload = {
        prompt: options.prompt || "",
        tags: options.tags || "instrumental, bass solo, groovy, funky, melodic bass",
        mv: options.mv || "chirp-v4",
        make_instrumental: options.make_instrumental ?? true,
        title: options.title || "Deep Groove Excursion"
    };

    try {
        const response = await fetch(`${config.baseUrl}/suno/submit/music`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: payload.prompt,
                tags: payload.tags,
                mv: payload.mv,
                make_instrumental: payload.make_instrumental,
                title: payload.title
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.message || response.statusText}`);
        }

        const data = await response.json();
        console.log('提交成功:', data);
        return data.data;
    } catch (error) {
        console.error('提交失败:', error);
        throw error;
    }
}

/**
 * 获取音乐生成结果
 * @param {string} taskId - 任务ID
 * @param {Object} [options] - 轮询选项
 * @param {number} [options.interval=2000] - 轮询间隔（毫秒）
 * @param {number} [options.timeout=300000] - 超时时间（毫秒）
 * @returns {Promise<Array>} - 生成结果
 */
async function fetchResult(taskId, options = {}) {
    const {
        interval = 2000,  // 默认每2秒查询一次
        timeout = 300000  // 默认5分钟超时
    } = options;

    const startTime = Date.now();

    while (true) {
        try {
            const response = await fetch(`${config.baseUrl}/suno/fetch/${taskId}`, {
                method: 'GET',
                headers: headers
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('获取结果状态:', data.data.status);

            // 检查是否超时
            if (Date.now() - startTime > timeout) {
                throw new Error('获取结果超时');
            }

            // 如果任务还未开始，等待后继续查询
            if (data.data.status === "NOT_START") {
                await new Promise(resolve => setTimeout(resolve, interval));
                continue;
            }

            // 如果任务失败
            if (data.data.status === "FAILED") {
                throw new Error(`任务失败: ${data.data.fail_reason || '未知原因'}`);
            }

            // 
            if (Array.isArray(data.data.data)) {
                return data.data.data.map(item => ({
                    audio_url: item.audio_url,
                    image_url: item.image_url,
                    avatar_image_url: item.avatar_image_url
                }));
            }

            // 其他状态，继续等待
            await new Promise(resolve => setTimeout(resolve, interval));
        } catch (error) {
            console.error('获取结果失败:', error);
            throw error;
        }
    }
}

/**
 * 生成音乐并等待结果
 * @param {Object} options - 生成选项
 * @returns {Promise<Object>} - 生成结果
 */
async function generateMusic(options = {}) {
    try {
        // 提交生成请求
        const taskId = await submitMusic(options);
        console.log('任务ID:', taskId);

        // 获取生成结果
        const result = await fetchResult(taskId);
        return result;
    } catch (error) {
        console.error('生成音乐失败:', error);
        throw error;
    }
}

// 如果在浏览器环境中，将函数添加到全局对象
if (typeof window !== 'undefined') {
    window.Suno = {
        submitMusic,
        fetchResult,
        generateMusic
    };
}

// 如果在 Node.js 环境中，导出函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        submitMusic,
        fetchResult,
        generateMusic
    };
}