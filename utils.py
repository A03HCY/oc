from typing    import Callable, Any
from functools import wraps
from time      import sleep
from re        import search
from .data     import EmailMatch
import random
import string
import os
import pickle
import json
import yaml
import base64


def try_for(times: int, delay: int = 0) -> Callable:
    def decorator(func: Callable):
        if times == -1:
            max_attempts = float('inf')
        elif times < 1:
            raise ValueError("times must be at least 1 or -1 for infinite retries")
        else:
            max_attempts = times

        if delay < 0:
            raise ValueError("delay must be at least 0")

        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            attempt = 0
            while True:
                try: return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    attempt += 1
                    if attempt >= max_attempts: break
                    if delay > 0: sleep(delay)
            if last_exception:
                raise last_exception
            else:
                raise RuntimeError("Function was not attempted")
        return wrapper
    return decorator


def flatten(q):
    # 递归展开嵌套OR
    if isinstance(q, list):
        res = []
        for i in q:
            res.extend(flatten(i))
        return res
    return [q]


def email(email:str) -> EmailMatch:
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    matched_email = search(email_pattern, email)
    matched_email = matched_email.group() if matched_email else ''
    return EmailMatch(
        matched_email=matched_email,
        is_email=bool(matched_email == email)
    )


def safecode(num:int=6, pure_num:bool=False) -> str:
    if pure_num:
        return ''.join(random.choices(string.digits, k=num))
    else:
        return ''.join(random.choices(string.ascii_letters + string.digits, k=num))

def locate_geo():
    '''
    获取用户的大致地理位置.
    Returns:
        dict:  {'continent': '亚洲', 'country': '中国', 'owner': '...', 'isp': '...', 'prov': 
                '...省', 'city': '...', 'district': '...'}
    '''
    from .web_fetch import req_json
    #result: dict = req_json('https://qifu-api.baidubce.com/ip/local/geo/v1/district').get('data', {})
    #result.pop('zipcode')
    #result.pop('adcode')
    #return result
    return req_json('https://my.ip.cn/json/').get('data')


def req_file(path:str, mode:str='r', encoding:str='utf-8') -> str:
    '''
    从文件中读取内容
    '''
    if not os.path.isfile(path): return ''
    with open(path, mode, encoding=encoding) as f:
        return f.read()


def save_pickle(data: Any, path: str) -> None:
    with open(path, 'wb') as f:
        pickle.dump(data, f)


def load_pickle(path: str) -> Any:
    with open(path, 'rb') as f:
        return pickle.load(f)


def save_json(data: Any, path: str) -> None:
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)


def load_json(path: str) -> Any:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_yaml(data: Any, path: str) -> None:
    with open(path, 'w', encoding='utf-8') as f:
        yaml.dump(data, f, allow_unicode=True)


def load_yaml(path: str) -> Any:
    with open(path, 'r', encoding='utf-8') as f:
        return yaml.load(f, Loader=yaml.FullLoader)

def req_base64_file(path:str) -> str:
    return base64.b64encode(req_file(path, mode='rb')).decode('utf-8')
