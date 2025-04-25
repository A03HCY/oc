/**
 * FetchMind 类，使用浏览器原生的fetch API封装对OpenAI API的访问
 */
class FetchMind {
  /**
   * 创建一个新的 FetchMind 实例
   * @param {string} model - 使用的模型名称
   * @param {string} key - OpenAI API 密钥
   * @param {string|null} endpoint - 可选的自定义 API 端点
   */
  constructor(model, key, endpoint = null) {
    this.model = model;
    this.apiKey = key;
    this.endpoint = endpoint || 'https://api.openai.com/v1';

    this._memories = [];

    this._predefined = {
      'system': '',
      'persona': '',
      'format': '',
      'profile': '',
      'world': ''
    };

    this.set_model(model);
  }

  /**
   * 设置使用的模型
   * @param {string} model - 模型名称
   */
  set_model(model) {
    this.model = model;
  }

  /**
   * 添加一条记忆
   * @param {string} role - 角色（如 'user', 'assistant', 'system'）
   * @param {string|Array} content - 内容
   * @param {Object} kwargs - 其他参数
   */
  add_memory(role, content, kwargs = {}) {
    const data = {
      role: role,
      content: content,
      ...kwargs
    };
    this._memories.push(data);
  }

  /**
   * 检查内容是否有效
   * @param {string} role - 角色
   * @param {string} content - 内容
   * @returns {Object|null} - 有效的消息对象或 null
   */
  check_content(role, content) {
    if (!content) return null;
    return {
      role: role,
      content: content
    };
  }

  /**
   * 设置预定义内容
   * @param {string} target - 目标类型
   * @param {string} content - 内容
   */
  set(target, content) {
    if (!Object.keys(this._predefined).includes(target)) return;
    this._predefined[target] = content;
  }

  /**
   * 构建记忆列表
   * @returns {Array} - 记忆列表
   */
  get build_memory() {
    const newMemories = [];

    for (const [key, item] of Object.entries(this._predefined)) {
      let pre = null;
      if (['system', 'persona', 'format'].includes(key)) {
        pre = this.check_content('system', item);
      }
      if (key === 'profile' && item) {
        pre = this.check_content('user', 'Read User\'s Profile and Remember:\n' + item);
      }
      if (pre) newMemories.push(pre);
    }

    return [...newMemories, ...this._memories];
  }

  /**
   * 保存当前对话状态到JSON对象或字符串
   * @param {boolean} asString - 是否返回字符串，默认返回对象
   * @param {boolean} includeModel - 是否包含模型信息
   * @param {boolean} includeEndpoint - 是否包含API端点信息
   * @returns {Object|string} - 保存的状态，可以是对象或字符串
   */
  save(asString = false, includeModel = true, includeEndpoint = false) {
    // 创建包含状态的对象
    const state = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      predefined: { ...this._predefined },
      memories: [...this._memories]
    };
    
    // 可选地包含模型信息
    if (includeModel) {
      state.model = this.model;
    }
    
    // 可选地包含端点信息
    if (includeEndpoint) {
      state.endpoint = this.endpoint;
    }
    
    // 根据需要返回字符串或对象
    return asString ? JSON.stringify(state) : state;
  }

  /**
   * 从保存的状态中加载对话
   * @param {Object|string} data - 保存的状态，可以是对象或字符串
   * @param {Object} options - 加载选项
   * @param {boolean} options.clearExisting - 是否清除现有记忆，默认为true
   * @param {boolean} options.loadModel - 是否加载模型信息，默认为true
   * @param {boolean} options.loadEndpoint - 是否加载端点信息，默认为false
   * @returns {boolean} - 加载是否成功
   */
  load(data, options = {}) {
    const {
      clearExisting = true,
      loadModel = true,
      loadEndpoint = false
    } = options;
    
    try {
      // 如果输入是字符串，尝试解析成JSON对象
      const state = typeof data === 'string' ? JSON.parse(data) : data;
      
      // 验证数据结构
      if (!state || typeof state !== 'object') {
        throw new Error('无效的状态数据：数据必须是一个对象');
      }
      
      if (!state.predefined || !state.memories) {
        throw new Error('无效的状态数据：缺少必要的字段');
      }
      
      // 加载前清空现有记忆
      if (clearExisting) {
        this._memories = [];
        this._predefined = {
          'system': '',
          'persona': '',
          'format': '',
          'profile': '',
          'world': ''
        };
      }
      
      // 加载预定义设置
      if (state.predefined) {
        Object.keys(this._predefined).forEach(key => {
          if (state.predefined[key] !== undefined) {
            this._predefined[key] = state.predefined[key];
          }
        });
      }
      
      // 加载记忆
      if (Array.isArray(state.memories)) {
        this._memories = [...state.memories];
      }
      
      // 可选地加载模型信息
      if (loadModel && state.model) {
        this.set_model(state.model);
      }
      
      // 可选地加载端点信息
      if (loadEndpoint && state.endpoint) {
        this.endpoint = state.endpoint;
      }
      
      return true;
    } catch (error) {
      console.error('加载状态失败:', error);
      return false;
    }
  }

  /**
   * 保存对话状态到文件（仅在支持 File API 的环境中可用）
   * @param {string} filename - 文件名，默认为 'chat_state.json'
   * @returns {boolean} - 保存是否成功
   */
  save_to_file(filename = 'chat_state.json') {
    try {
      // 检查是否在浏览器环境
      if (typeof window === 'undefined' || !window.Blob || !window.URL || !window.URL.createObjectURL) {
        throw new Error('当前环境不支持文件保存');
      }
      
      // 获取状态数据
      const stateJson = this.save(true);
      
      // 创建Blob对象
      const blob = new Blob([stateJson], { type: 'application/json' });
      
      // 创建下载链接
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      
      // 触发下载
      document.body.appendChild(a);
      a.click();
      
      // 清理
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
      
      return true;
    } catch (error) {
      console.error('保存到文件失败:', error);
      return false;
    }
  }

  /**
   * 从文件加载对话状态（仅在支持 File API 的环境中可用）
   * @param {File} file - 包含对话状态的文件对象
   * @returns {Promise<boolean>} - 加载是否成功的Promise
   */
  load_from_file(file) {
    return new Promise((resolve, reject) => {
      try {
        // 检查文件对象
        if (!file || !(file instanceof File)) {
          throw new Error('无效的文件对象');
        }
        
        const reader = new FileReader();
        
        reader.onload = (event) => {
          try {
            const data = event.target.result;
            const success = this.load(data);
            resolve(success);
          } catch (error) {
            console.error('解析文件内容失败:', error);
            reject(error);
          }
        };
        
        reader.onerror = (error) => {
          console.error('读取文件失败:', error);
          reject(error);
        };
        
        // 开始读取文件
        reader.readAsText(file);
      } catch (error) {
        console.error('加载文件失败:', error);
        reject(error);
      }
    });
  }

  /**
   * 发送阻塞请求
   * @private
   * @returns {Promise<Object>} - 响应结果
   */
  async __request_block() {
    try {
      const url = `${this.endpoint}/chat/completions`;
      const requestBody = {
        model: this.model,
        messages: this.build_memory,
        temperature: 0.7,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API请求失败: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        throw new Error('API响应中没有包含有效的回复');
      }

      const messageData = data.choices[0].message;
      this._memories.push({
        role: messageData.role,
        content: messageData.content
      });

      return {
        type: 'block',
        reasoning: [], // API不直接支持reasoning_content
        content: [messageData.content]
      };
    } catch (error) {
      console.error('请求失败:', error);
      throw error;
    }
  }

  /**
   * 发送流式请求
   * @private
   * @param {boolean} reasoning - 是否包含推理内容（在基础fetch实现中不支持，仅保留接口兼容性）
   * @returns {AsyncGenerator} - 异步生成器
   */
  async *__request_stream(reasoning = true) {
    try {
      const url = `${this.endpoint}/chat/completions`;
      const requestBody = {
        model: this.model,
        messages: this.build_memory,
        temperature: 0.7,
        stream: true,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API请求失败: ${errorText}`);
      }

      if (!response.body) {
        throw new Error('浏览器不支持流式响应');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let content = '';
      let partialLine = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 处理接收到的数据块
        const chunk = decoder.decode(value, { stream: true });
        partialLine += chunk;

        // SSE格式的数据以两个换行符分隔，先按行分割
        const lines = partialLine.split('\n\n');
        partialLine = lines.pop() || ''; // 最后一行可能不完整，保留

        for (const line of lines) {
          if (!line.trim() || line.startsWith(':')) continue; // 忽略空行和注释

          // 格式为 "data: {...JSON数据...}"
          if (line.startsWith('data: ')) {
            const jsonStr = line.substring(6);
            if (jsonStr === '[DONE]') continue;

            try {
              const json = JSON.parse(jsonStr);
              if (json.choices && json.choices[0]) {
                const delta = json.choices[0].delta;

                if (delta.content) {
                  content += delta.content;
                  yield {
                    type: 'content',
                    content: delta.content
                  };
                }
              }
            } catch (e) {
              console.warn('解析流式响应失败:', e);
            }
          }
        }
      }

      // 将最终的完整回复添加到记忆中
      if (content) {
        this.add_memory('assistant', content);
      }
    } catch (error) {
      console.error('流式请求失败:', error);
      throw error;
    }
  }

  /**
   * 发送请求
   * @param {boolean} stream - 是否使用流式传输
   * @param {boolean} reasoning - 是否包含推理内容
   * @returns {Promise<Object>|AsyncGenerator} - 响应结果或异步生成器
   */
  request(stream = false, reasoning = true) {
    if (stream) {
      return this.__request_stream(reasoning);
    } else {
      return this.__request_block();
    }
  }

  /**
   * 自动处理流式响应，简化使用流程
   * @param {Function} callback - 回调函数，每次接收到响应块时调用
   * @param {Object} options - 可选配置项
   * @param {boolean} options.reasoning - 是否包含推理内容
   * @param {Function} options.onStart - 开始请求时调用的函数
   * @param {Function} options.onEnd - 请求结束时调用的函数
   * @param {Function} options.onError - 发生错误时调用的函数
   * @returns {Promise<void>} - 完成后的Promise
   */
  async auto_quest(callback, options = {}) {
    const {
      reasoning = true,
      onStart = null,
      onEnd = null,
      onError = null
    } = options;

    try {
      // 调用开始回调
      if (onStart && typeof onStart === 'function') {
        onStart();
      }

      // 获取流式响应
      const response = this.__request_stream(reasoning);

      let fullContent = '';

      // 处理每个响应块
      for await (const chunk of response) {
        // 调用用户提供的回调函数处理每个响应块
        if (typeof callback === 'function') {
          callback(chunk);
        }

        // 如果是内容块，累加到完整内容中
        if (chunk.type === 'content') {
          fullContent += chunk.content;
        }
      }

      // 调用结束回调
      if (onEnd && typeof onEnd === 'function') {
        onEnd(fullContent);
      }

      return fullContent;
    } catch (error) {
      console.error('自动处理流式响应时出错:', error);

      // 调用错误回调
      if (onError && typeof onError === 'function') {
        onError(error);
      } else {
        throw error;
      }
    }
  }

  /**
   * 清除所有记忆
   */
  forget_all() {
    this._memories = [];
  }

  /**
   * 清除最后两条记忆
   */
  forget_last() {
    this._memories.pop();
    this._memories.pop();
  }
}

// 在浏览器环境中，将对象直接附加到 window 对象上
if (typeof window !== 'undefined') {
  window.FetchMind = FetchMind;
}

// 同时保留 CommonJS 模块导出，以便在 Node.js 环境中使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FetchMind };
} 