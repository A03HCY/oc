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
    this._functions = {};  // 存储函数元数据
    this._map = {};       // 存储函数映射

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
   * 注册一个函数
   * @param {Function} func - 要注册的函数
   * @returns {Function} - 包装后的函数
   */
  identify(func) {
    const funcName = func.name;
    
    // 获取函数签名信息
    const signature = this._getFunctionSignature(func);
    
    // 获取函数文档字符串
    const doc = func.toString().match(/\/\*\*([\s\S]*?)\*\//)?.[1] || '';
    
    // 提取函数描述和参数信息
    const { description, parameters } = this._parseFunctionDoc(doc, signature);
    
    // 存储API格式的函数信息
    this._functions[funcName] = {
      type: 'function',
      name: funcName,
      description: description,
      parameters: parameters,
    };
    
    this._map[funcName] = {
      original_function: func,
    };
    
    // 创建包装函数
    const wrapper = function(...args) {
      return func.apply(this, args);
    };
    
    // 使用 Object.defineProperty 设置函数名称
    Object.defineProperty(wrapper, 'name', {
      value: funcName,
      configurable: true
    });
    
    // 复制原函数的其他属性
    Object.getOwnPropertyNames(func).forEach(prop => {
      if (prop !== 'name' && prop !== 'length' && prop !== 'prototype') {
        try {
          Object.defineProperty(wrapper, prop, Object.getOwnPropertyDescriptor(func, prop));
        } catch (e) {
          console.warn(`无法复制属性 ${prop}:`, e);
        }
      }
    });
    
    return wrapper;
  }

  /**
   * 获取函数签名信息
   * @private
   * @param {Function} func - 要分析的函数
   * @returns {Object} - 函数签名信息
   */
  _getFunctionSignature(func) {
    const funcStr = func.toString();
    const paramsMatch = funcStr.match(/\(([^)]*)\)/);
    const params = paramsMatch ? paramsMatch[1].split(',').map(p => p.trim()) : [];
    
    return {
      params,
      hasRest: funcStr.includes('...'),
    };
  }

  /**
   * 解析函数文档
   * @private
   * @param {string} doc - 函数文档字符串
   * @param {Object} signature - 函数签名信息
   * @returns {Object} - 解析后的文档信息
   */
  _parseFunctionDoc(doc, signature) {
    let description = '';
    const parameters = {
      type: 'object',
      properties: {},
      required: []
    };
    
    // 清理文档字符串
    doc = doc.replace(/^\s*\*\s*/gm, '').trim();
    
    // 提取主要描述（@param 之前的内容）
    const mainDescMatch = doc.match(/(.*?)(?=@param|@returns|$)/s);
    if (mainDescMatch) {
      description = mainDescMatch[1].trim();
    }
    
    // 提取参数信息
    const paramRegex = /@param\s+{([^}]+)}\s+(\w+)\s+(.*?)(?=@param|@returns|$)/gs;
    let paramMatch;
    
    while ((paramMatch = paramRegex.exec(doc)) !== null) {
      const [_, type, name, desc] = paramMatch;
      parameters.properties[name] = {
        type: this._convertType(type),
        description: desc.trim()
      };
      
      // 如果参数没有默认值，则标记为必需
      if (!signature.params.find(p => p.startsWith(name + '='))) {
        parameters.required.push(name);
      }
    }
    
    // 提取返回值信息
    const returnRegex = /@returns\s+{([^}]+)}\s+(.*?)(?=@param|$)/s;
    const returnMatch = returnRegex.exec(doc);
    if (returnMatch) {
      const [_, type, desc] = returnMatch;
      parameters.properties['return'] = {
        type: this._convertType(type),
        description: desc.trim()
      };
    }
    
    return { description, parameters };
  }

  /**
   * 转换类型
   * @private
   * @param {string} type - 类型字符串
   * @returns {string} - 转换后的类型
   */
  _convertType(type) {
    const typeMap = {
      'string': 'string',
      'number': 'number',
      'boolean': 'boolean',
      'object': 'object',
      'array': 'array',
      'function': 'object',
      'any': 'string',
      'void': 'null',
      'null': 'null',
      'undefined': 'null',
      'int': 'integer',
      'float': 'number',
      'double': 'number',
      'long': 'integer',
      'short': 'integer',
      'byte': 'integer',
      'char': 'string',
      'date': 'string',
      'datetime': 'string',
      'time': 'string',
      'timestamp': 'string',
      'json': 'object',
      'promise': 'object',
      'async': 'object'
    };
    
    // 处理数组类型
    if (type.endsWith('[]')) {
      return 'array';
    }
    
    // 处理联合类型
    if (type.includes('|')) {
      const types = type.split('|').map(t => t.trim());
      const convertedTypes = types.map(t => this._convertType(t));
      return convertedTypes[0]; // 返回第一个类型作为主要类型
    }
    
    // 处理泛型类型
    if (type.includes('<')) {
      const baseType = type.split('<')[0].trim();
      return this._convertType(baseType);
    }
    
    return typeMap[type.toLowerCase()] || 'string';
  }

  /**
   * 获取函数列表
   * @returns {Array} - 函数列表
   */
  get functions() {
    return Object.values(this._functions).map(func => ({
      type: 'function',
      function: func
    }));
  }

  /**
   * 添加工具函数
   * @param {Function} func - 要添加的函数
   * @param {Object} [options] - 函数配置选项
   * @param {string} [options.description] - 函数描述
   * @param {Object} [options.parameters] - 函数参数配置
   * @param {Object} [options.parameters.properties] - 参数属性
   * @param {string[]} [options.parameters.required] - 必需参数列表
   */
  add_tool(func, options = {}) {
    const funcName = func.name;
    
    // 存储API格式的函数信息
    this._functions[funcName] = {
      type: 'function',
      name: funcName,
      description: options.description || '',
      parameters: options.parameters || {
        type: 'object',
        properties: {},
        required: []
      }
    };
    
    this._map[funcName] = {
      original_function: func,
    };
    
    // 创建包装函数
    const wrapper = function(...args) {
      return func.apply(this, args);
    };
    
    // 使用 Object.defineProperty 设置函数名称
    Object.defineProperty(wrapper, 'name', {
      value: funcName,
      configurable: true
    });
    
    return wrapper;
  }

  /**
   * 设置函数调用前的回调
   * @param {Function} callback - 回调函数
   */
  on_calling(callback) {
    this._on_calling = callback;
  }

  /**
   * 设置函数调用后的回调
   * @param {Function} callback - 回调函数
   */
  on_called(callback) {
    this._on_called = callback;
  }

  /**
   * 设置准备调用前的回调
   * @param {Function} callback - 回调函数
   */
  on_preparing(callback) {
    this._on_preparing = callback;
  }

  /**
   * 调用函数
   * @param {string} functionName - 函数名称
   * @param {Object} args - 函数参数
   * @returns {any} - 函数调用结果
   */
  call(functionName, args) {
    if (!this._map[functionName]) {
      throw new Error(`函数 '${functionName}' 未注册`);
    }
    
    const func = this._map[functionName].original_function;
    const funcInfo = this._functions[functionName];
    
    // 调用前的回调
    if (this._on_calling) {
      try {
        const newFunc = this._on_calling(func, args);
        if (typeof newFunc === 'function') {
          func = newFunc;
        }
      } catch (e) {
        console.warn('调用前回调执行失败:', e);
      }
    }
    
    let result = null;
    try {
      // 按照函数定义的参数顺序传递参数
      const orderedArgs = funcInfo.parameters.properties ? 
        Object.keys(funcInfo.parameters.properties).map(paramName => args[paramName]) :
        Object.values(args);
      
      result = func(...orderedArgs);
    } catch (e) {
      throw new Error(`调用函数 '${functionName}' 时出错: ${e.message}`);
    } finally {
      // 调用后的回调
      if (this._on_called) {
        try {
          this._on_called(func, result);
        } catch (e) {
          console.warn('调用后回调执行失败:', e);
        }
      }
    }
    
    return result;
  }

  /**
   * 处理函数调用
   * @private
   * @param {Array} toolCalls - 工具调用列表
   * @returns {Array} - 处理结果
   */
  _handleToolCalls(toolCalls) {
    return toolCalls.map(call => {
      const functionName = call.function.name;
      const args = JSON.parse(call.function.arguments);
      
      return {
        tool_call_id: call.id,
        role: 'tool',
        name: functionName,
        content: String(this.call(functionName, args))
      };
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
        tools: this.functions,
        tool_choice: "auto"
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
      this._memories.push(messageData);

      // 处理函数调用
      if (messageData.tool_calls) {
        const toolResults = this._handleToolCalls(messageData.tool_calls);
        this._memories.push(...toolResults);
        
        // 递归处理后续响应
        const nextResponse = await this.__request_block();
        return {
          type: 'block',
          reasoning: [],
          content: [messageData.content, ...nextResponse.content]
        };
      }

      return {
        type: 'block',
        reasoning: [],
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
   * @param {boolean} reasoning - 是否包含推理内容
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
        tools: this.functions,
        tool_choice: "auto"
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
      let toolCalls = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        partialLine += chunk;

        const lines = partialLine.split('\n\n');
        partialLine = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || line.startsWith(':')) continue;

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

                if (delta.tool_calls) {
                  for (const toolCall of delta.tool_calls) {
                    const index = toolCall.index;
                    if (!toolCalls[index]) {
                      toolCalls[index] = {
                        id: '',
                        type: 'function',
                        function: { name: '', arguments: '' }
                      };
                    }

                    if (toolCall.id) {
                      toolCalls[index].id += toolCall.id;
                    }
                    if (toolCall.function.name) {
                      toolCalls[index].function.name += toolCall.function.name;
                    }
                    if (toolCall.function.arguments) {
                      toolCalls[index].function.arguments += toolCall.function.arguments;
                    }
                  }
                }
              }
            } catch (e) {
              console.warn('解析流式响应失败:', e);
            }
          }
        }
      }

      // 处理函数调用
      if (toolCalls.length > 0) {
        this.add_memory('assistant', content, { tool_calls: toolCalls });
        const toolResults = this._handleToolCalls(toolCalls);
        this._memories.push(...toolResults);
        
        // 递归处理后续响应
        yield* this.__request_stream(reasoning);
      } else {
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