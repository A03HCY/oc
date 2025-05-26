from typing      import Any, Callable, Union, List, Tuple, Dict
from dataclasses import dataclass, field
from .mcp        import MCPClient
from dlso        import req_file
import inspect
import re
import os
import json


@dataclass
class Endpoint:
    model:str    = field(default='')
    key:str      = field(default='')
    endpoint:str = field(default='')


def to_dict_recursive(obj: Any) -> Union[Dict, List, Tuple, Any]:
    """
    递归地将对象转换为字典（如果对象支持 .dict() 方法）。
    同时处理嵌套的字典、列表和元组。
    基本类型（int, float, str, bool, None）将保持不变。

    Args:
        obj: 要转换的对象。

    Returns:
        对象的字典表示形式，或者如果它是基本类型或不支持 .dict() 方法
        （并且不是 dict、list 或 tuple），则返回原始对象。
    """
    # 1. 处理字典：递归转换其值
    if isinstance(obj, dict):
        return {k: to_dict_recursive(v) for k, v in obj.items()}

    # 2. 处理列表和元组：递归转换其元素，并保持原始类型
    elif isinstance(obj, (list, tuple)):
        original_type = type(obj)
        return original_type(to_dict_recursive(item) for item in obj)

    # 3. 处理具有 .dict() 方法的对象
    #    使用 getattr 获取属性，并检查它是否可调用 (callable)
    elif hasattr(obj, 'dict') and callable(getattr(obj, 'dict')):
        try:
            # 调用对象的 .dict() 方法获取其字典表示
            dict_repr = obj.dict()
            # 重要：对 .dict() 返回的结果再次调用 to_dict_recursive
            # 以处理其内部可能包含的需要转换的嵌套对象/列表/字典
            return to_dict_recursive(dict_repr)
        except Exception as e:
            # 如果调用 .dict() 出错，可以选择记录日志或返回原始对象
            print(f"警告：在 {type(obj)} 上调用 .dict() 时出错: {e}")
            return obj # 或者根据需要引发错误: raise

    # 4. 处理基本类型或不支持 .dict() 的其他对象：直接返回
    else:
        return obj


class Identify:
    def __init__(self, 
                 default_description='No documentation provided', 
                 var_positional_desc='Variable length argument list', 
                 var_keyword_desc='Arbitrary keyword arguments') -> None:
        '''
        初始化Identify类
        
        Args:
            default_description: 普通参数没有文档注释时使用的默认描述
            var_positional_desc: 可变位置参数(*args)没有文档注释时使用的默认描述
            var_keyword_desc: 可变关键字参数(**kwargs)没有文档注释时使用的默认描述
        '''
        self._functions: dict[str, Any] = {}
        self._map: dict[
            str, 
            dict[str, Callable]
            ] = {}
        self.default_description = default_description
        self.var_positional_desc = var_positional_desc
        self.var_keyword_desc = var_keyword_desc
        self.on_calling: Callable = None
        self.on_called: Callable = None
    
    @property
    def functions_list(self) -> Dict[str, str]:
        """
        返回函数列表
        
        Returns:
            dict: 函数列表，其中键是函数名称，值是函数描述
        """
        result = {}
        for func_name, func_info in self._functions.items():
            result[func_name] = func_info['description']
        return result
    
    def set_model(self, model: str):
        """
        设置预定义模型名称
        
        Args:
            model: 模型名称，用于确定工具调用角色
            
        Raises:
            ValueError: 当模型名称为空时抛出
        """
        if not model:
            raise ValueError("模型名称不能为空")
        self._predefined_model = model  # 保存原始模型名，不需要转小写
    
    def extend(self, idf:'Identify') -> 'Identify':
        '''
        扩展当前Identify实例，合并另一个Identify实例的函数和映射
        
        Args:
            idf: 要合并的Identify实例
        '''
        # 合并函数元数据信息
        for func_name, func_info in idf._functions.items():
            if func_name not in self._functions:
                self._functions[func_name] = func_info
        
        # 合并函数映射
        for func_name, func_map in idf._map.items():
            if func_name not in self._map:
                self._map[func_name] = func_map
        
        return self
    
    def add_mcp(self, mcp: MCPClient):
        tools = mcp.list_tools()
        for tool in tools:
            func_name = tool['name']
            description = tool['description']
            parameters = tool['inputSchema']
            
            # 注册函数元数据
            self._functions[func_name] = {
                'type': 'function',
                'name': func_name,
                'description': description,
                'parameters': parameters,
            }
            
            # 使用闭包工厂捕获当前func_name的值
            def create_tool_function(current_func_name):
                def mcp_tool(**kwargs):
                    return mcp.call_tool(current_func_name, input_data=kwargs)
                return mcp_tool
            
            # 生成并存储工具函数
            self._map[func_name] = {
                'original_function': create_tool_function(func_name),  # 立即绑定当前func_name
                'mcp_name': mcp.server_name,
            }
    
    def remove_mcp(self, name: str) -> None:
        """移除指定MCP服务器的所有工具
        
        Args:
            name: MCP服务器名称
        """
        # 找出所有属于该MCP服务器的工具
        to_remove = [
            func_name for func_name, func_info in self._map.items() 
            if func_info.get('mcp_name') == name
        ]
        
        # 批量移除
        for func_name in to_remove:
            self._functions.pop(func_name, None)
            self._map.pop(func_name, None)
        
    def identify(self, func: Callable[..., Any]) -> Callable[..., Any]:
        '''
        装饰器，用于收集函数的元数据并按照API格式存储函数
        '''
        # 获取函数名称
        func_name = func.__name__
        
        # 获取函数签名信息
        signature = inspect.signature(func)
        
        # 获取函数文档字符串
        doc = func.__doc__ or ''
        
        # 提取函数描述和Example部分
        if doc:
            # 提取主要描述（Args部分之前的内容）
            main_description_parts = []
            for line in doc.strip().split('\n'):
                line = line.strip()
                if line.startswith('Args:') or line.startswith('Returns:') or line.startswith('Example:'):
                    break
                if line:
                    main_description_parts.append(line)
            main_description = ' '.join(main_description_parts)
            
            # 提取Example部分（如果存在）
            example_parts = []
            in_example = False
            for line in doc.strip().split('\n'):
                line = line.strip()
                if line.startswith('Example:'):
                    in_example = True
                    example_parts.append(line)
                    continue
                
                if in_example:
                    if line.startswith('Args:') or line.startswith('Returns:'):
                        break
                    example_parts.append(line)
            
            # 组合描述
            if example_parts:
                example_text = '\n'.join(example_parts)
                description = f"{main_description}\n\n{example_text}"
            else:
                description = main_description
        else:
            description = ''
        
        # 构建参数信息
        parameters = {
            'type': 'object',
            'properties': {},
            'required': []
        }
        
        # 解析文档中的参数描述
        param_descriptions = {}
        if doc:
            # 改进Args部分的解析
            arg_pattern = re.compile(r'Args:(.*?)(?:Returns:|$)', re.DOTALL)
            arg_match = arg_pattern.search(doc)
            if arg_match:
                arg_section = arg_match.group(1).strip()
                param_pattern = re.compile(r'\s*([a-zA-Z0-9_]+):\s*(.*?)(?=\s*[a-zA-Z0-9_]+:|$)', re.DOTALL)
                for match in param_pattern.finditer(arg_section):
                    param_name = match.group(1).strip()
                    param_desc = match.group(2).strip()
                    # 处理换行和多余空格
                    param_desc = re.sub(r'\n\s+', ' ', param_desc)
                    param_descriptions[param_name] = param_desc
        
        # 处理函数参数
        for param_name, param in signature.parameters.items():
            # 跳过self参数
            if param_name == 'self':
                continue
                
            # 特殊处理可变位置参数 (*args)
            if param.kind == inspect.Parameter.VAR_POSITIONAL:
                param_info = {
                    'type': 'array',
                    'description': param_descriptions.get(param_name, self.var_positional_desc)
                }
                # 可变位置参数不应标记为必需
                parameters['properties'][param_name] = param_info
                continue
                
            # 特殊处理可变关键字参数 (**kwargs)
            if param.kind == inspect.Parameter.VAR_KEYWORD:
                param_info = {
                    'type': 'object',
                    'description': param_descriptions.get(param_name, self.var_keyword_desc)
                }
                # 可变关键字参数不应标记为必需
                parameters['properties'][param_name] = param_info
                continue
                
            # 处理普通参数
            param_info = {
                'type': self._get_type_name(param.annotation),
                'description': param_descriptions.get(param_name, self.default_description)
            }
            
            # 检查是否有默认值（非必需参数）
            if param.default is param.empty:
                parameters['required'].append(param_name)
            elif isinstance(param.default, (list, tuple)) and len(param.default) > 0:
                # 如果有枚举值
                parameters['required'].append(param_name)
                param_info['enum'] = list(param.default)
            
            parameters['properties'][param_name] = param_info
        
        # 存储API格式的函数信息
        self._functions[func_name] = {
            'type': 'function',
            'name': func_name,
            'description': description,
            'parameters': parameters,
        }
        self._map[func_name] = {
            'original_function': func,  # 保留原始函数以便调用
        }
        
        # 创建包装函数，保持原函数行为不变
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)
        
        # 保留原函数的元数据
        wrapper.__name__ = func.__name__
        wrapper.__doc__ = func.__doc__
        wrapper.__annotations__ = func.__annotations__
        
        return wrapper
    
    def _get_type_name(self, annotation):
        '''从类型注解中获取类型名称'''
        if annotation is inspect.Parameter.empty:
            return 'string'
        
        # 特殊处理泛型dict类型，直接返回object
        if getattr(annotation, '__origin__', None) is dict:
            return 'object'
            
        # 特殊处理泛型list类型，直接返回array
        if getattr(annotation, '__origin__', None) is list:
            return 'array'
            
        # 处理Python 3.10+ Union类型 (int|str)
        if hasattr(annotation, '__or__') and hasattr(annotation, '__args__'):
            # Union类型会有__args__属性包含所有可能的类型
            types = []
            for arg in annotation.__args__:
                # 递归处理Union中的每个类型
                type_name = self._get_type_name(arg)
                if type_name not in types:
                    types.append(type_name)
            # 如果是多个类型，返回第一个有效类型
            if types:
                return types[0]
            return 'string'  # 默认返回 string
        
        # 处理typing模块中的Union类型 (Union[int, str])
        if hasattr(annotation, '__origin__') and annotation.__origin__ is Union:
            types = []
            for arg in annotation.__args__:
                type_name = self._get_type_name(arg)
                if type_name not in types:
                    types.append(type_name)
            if types:
                return types[0]
            return 'string'  # 默认返回 string
        
        # 处理其他泛型类型
        if hasattr(annotation, '__origin__'):
            origin = annotation.__origin__
            try:
                type_name = str(origin.__name__).lower()
                if type_name in ['string', 'integer', 'number', 'boolean', 'object', 'array']:
                    return type_name
                return 'string'  # 未知类型返回 string
            except AttributeError:
                return 'string'  # 未知类型返回 string
        
        # 处理基本类型
        if annotation is str:
            return 'string'
        if annotation is int:
            return 'integer'
        if annotation is float:
            return 'number'
        if annotation is bool:
            return 'boolean'
        if annotation is dict:
            return 'object'
        if annotation is list:
            return 'array'
        
        # 默认情况
        try:
            type_name = str(annotation.__name__).lower()
            if type_name in ['string', 'integer', 'number', 'boolean', 'object', 'array']:
                return type_name
            return 'string'  # 未知类型返回 string
        except AttributeError:
            return 'string'  # 未知类型返回 string
    
    def req_info(self, func_name: str=None, strict=False) -> dict:
        '''
        获取指定函数的API格式元数据信息
        
        Args:
            func_name: 函数名称
            strict: 是否使用严格模式
                   严格模式下，所有参数都会被标记为required，
                   非必需参数会被设置为[type, 'null']类型
        '''
        if not func_name:
            info = []
            for f in self._functions:
                info.append(self.req_info(f, strict=strict))
            return info
        if func_name in self._functions:
            func_info = dict(self._functions[func_name])  # 创建一个副本避免修改原始数据
            
            if strict:
                # 添加严格模式标记
                func_info['strict'] = True
                
                # 获取参数信息的副本
                parameters = dict(func_info['parameters'])
                properties = dict(parameters['properties'])
                
                # 所有参数都是必需的，但类型可能包含null
                all_params = list(properties.keys())
                original_required = parameters.get('required', [])
                
                # 处理每个参数的类型
                for param_name, param_info in properties.items():
                    # 如果参数不在原来的required列表中，则添加null类型
                    if param_name not in original_required:
                        param_type = param_info['type']
                        # 如果类型已经是列表，则添加'null'
                        if isinstance(param_type, list):
                            if 'null' not in param_type:
                                param_type.append('null')
                        else:
                            # 转换为包含原类型和null的列表
                            param_info['type'] = [param_type, 'null']
                
                # 更新参数信息
                parameters['required'] = all_params
                parameters['additionalProperties'] = False
                
                # 更新func_info中的参数信息
                func_info['parameters'] = parameters
            
            # 修改结构
            func_info.pop('type')
            func_info = {
                'type': 'function',
                'function': func_info
            }

            return func_info
        return None
    
    def call(self, function_name:str, *args, **kwargs):
        '''
        通过函数名调用已注册的函数
        
        Args:
            function_name: 要调用的函数名
            *args: 传递给函数的位置参数
            **kwargs: 传递给函数的关键字参数
            
        Returns:
            函数调用的结果
            
        Raises:
            ValueError: 函数名不存在时抛出异常
            Exception: 函数调用出错时抛出原始异常
        '''
        if function_name not in self._map:
            raise ValueError(f"函数 '{function_name}' 未注册")
            
        func = self._map[function_name]['original_function']
        if self.on_calling:
            try:
                new_func = self.on_calling(func, args, kwargs)
                if isinstance(new_func, callable): func = new_func
            except: pass
        
        result = None
        try:
            # 调用函数并返回结果
            result = func(*args, **kwargs)
        except Exception as e:
            # 捕获执行错误，添加更多上下文信息
            raise Exception(f"调用函数 '{function_name}' 时出错: {str(e)}") from e
        finally:
            if self.on_called:
                try:
                    self.on_called(func, result)
                except: pass
            return result if result else None
    
    def calls(self, info:list) -> dict:
        final = []
        for call in to_dict_recursive(info):
            funtion_name = call['function']['name']
            try:
                kwargs = json.loads(call['function']['arguments'])
            except:
                raise Exception

            result = {
                "tool_call_id": call['id'],
                "role": "tool",
                "name": funtion_name,
                "content": str(to_dict_recursive(self.call(funtion_name, **kwargs))),
            }
            final.append(result)
        return final


class Mind:
    def __init__(self, model:str|Endpoint, key:str=None, endpoint:str=None, identify:Identify=None):
        self.model: str = None
        self.idf: Identify = identify or Identify()
        import openai
        self._ai: openai.OpenAI = None

        if isinstance(model, Endpoint):
            self.reload_endpoint(model)
        else:
            self.set_model(model)
            os.environ['OPENAI_API_KEY'] = key
            self._ai = openai.OpenAI(
                api_key  = key,
                base_url = endpoint
            )

        self._memories: list[dict] = []

        self._predefined: List[Tuple[str, str]] = []
        self._notice: List[Tuple[str, str]] = []
        
        self.on_preparing_call: Callable = None

    def tool(self) -> Callable:
        return self.idf.identify
    
    def add_tool(self, func: Callable|List[Callable]) -> None:
        if isinstance(func, list):
            for f in func: self.add_tool(f)
        else:
            self.idf.identify(func=func)
    
    def on_calling(self) -> Callable:
        def decorator(func: Callable) -> Callable:
            self.idf.on_calling  = func
            return func
        return decorator
    
    def on_called(self) -> Callable:
        def decorator(func: Callable) -> Callable:
            self.idf.on_called  = func
            return func
        return decorator
    
    def on_preparing(self) -> Callable:
        def decorator(func: Callable) -> Callable:
            self.on_preparing_call = func
            return func
        return decorator
    
    def set_model(self, model:str):
        self.model = model
    
    def reload_endpoint(self, endpoint:Endpoint) -> None:
        import openai
        self.set_model(endpoint.model)
        os.environ['OPENAI_API_KEY'] = endpoint.key
        self._ai = openai.OpenAI(
            api_key  = endpoint.key,
            base_url = endpoint.endpoint
        )
    
    def add_content(self, role:str, content:str|list[dict[str, Any]], **kwargs):
        data = {
            "role": role,
            "content": content,
        }
        data.update(kwargs)
        self._memories.append(data)
    
    def check_content(self, role:str, content:str):
        if not content: return None
        return {
            'role': role,
            'content': content
        }
    
    def reset_predefined(self, data:List[Tuple[str, str]]):
        self._predefined = data

    def add_predefined_prompt(self, role:str,  content:str):
        if os.path.isfile(content):
            content = req_file(content)
        self._predefined.append((role, content))
    
    @property
    def functions(self) -> list[str]:
        return self.idf.req_info()
    
    @property
    def build_memory(self) -> list:
        new = []
        for i in self._predefined:
            pre = self.check_content(i[0], i[1])
            if pre: new.append(pre)
        new.extend(self._memories)
        for i in self._notice:
            pre = self.check_content(i[0], i[1])
            if pre: new.append(pre)
        return new
    
    def __request_block(self, **kwargs):
        response = self._ai.chat.completions.create(
            model       = self.model,
            messages    = self.build_memory,
            tools       = self.idf.req_info(strict=True),
            tool_choice = "auto",
            **kwargs
        )
        original_data = to_dict_recursive(response.choices[0])
        data = original_data['message']
        self._memories.append(to_dict_recursive(data))
        if original_data.get('reasoning_content'):
            reason = [original_data['reasoning_content']]
        else:
            reason = []
        content = [data['content']]
        if data['tool_calls']:
            results = self.idf.calls(data['tool_calls'])
            self._memories.extend(results)
            temp = self.__request_block()
            reason.extend(temp['reasoning'])
            content.extend(temp['content'])
        return {
            'type': 'block',
            'reasoning': reason,
            'content': content
        }
    
    def __request_stream(self, reasoning:bool=True, **kwargs):
        response = self._ai.chat.completions.create(
            model       = self.model,
            messages    = self.build_memory,
            tools       = self.idf.req_info(strict=True),
            tool_choice = "auto",
            stream      = True,
            **kwargs
        )
        tool_calls = []
        content = ''
        for chunk in response:
            if not chunk.choices: continue
            if not chunk.choices[0].delta:continue
            delta = to_dict_recursive(chunk.choices[0].delta)
            
            if delta.get('reasoning_content') and reasoning == True:
                yield {
                    'type': 'reasoning_content',
                    'content': delta['reasoning_content']
                }
            
            if delta.get('content'):
                content += delta['content']
                yield {
                    'type': 'content',
                    'content': delta['content']
                }
                
            if delta.get('tool_calls'):
                tcchunklist = delta['tool_calls']
                for tcchunk in tcchunklist:
                    if len(tool_calls) <= tcchunk['index']:
                        tool_calls.append({'id': '', 'type': 'function', 'function': {'name': '', 'arguments': ''}})
                    tc = tool_calls[tcchunk['index']]
                    
                    if tcchunk['id']:
                        tc['id'] += tcchunk['id']
                    if tcchunk['function']['name']:
                        if self.on_preparing_call:
                            try:
                                self.on_preparing_call(tcchunk['function']['name'])
                            except: pass
                        tc['function']['name'] += tcchunk['function']['name']
                    if tcchunk['function']['arguments']:
                        tc['function']['arguments'] += tcchunk['function']['arguments']
        

        if tool_calls:
            self.add_content('assistant', content, tool_calls=tool_calls)
            results = self.idf.calls(tool_calls)
            self._memories.extend(results)
            yield from self.__request_stream(reasoning=reasoning)
        else:
            self.add_content('assistant', content)

    
    def request(self, stream:bool=False, reasoning:bool=True, **kwargs) -> Union[dict, Any]:
        if stream:
            return self.__request_stream(reasoning=reasoning, **kwargs)
        else:
            return self.__request_block(**kwargs)
    
    def forget_all(self):
        self._memories = []
    
    def forget_last(self):
        self._memories.pop()
        self._memories.pop()