from typing      import List, Dict
from dlso        import req_content, req_json
from bs4         import BeautifulSoup
from .data       import *


class CMA:
    @staticmethod
    def req_alarm() -> AlarmResult:
        result = req_json('https://weather.cma.cn/api/map/alarm')
        if not result.get('msg') == 'success':
            return AlarmResult(success=False)
        alarms = []
        data: List[Dict[str, str]] = result['data']
        for info in data:
            lon = info.get('longitude')
            lat = info.get('latitude')
            alarms.append(AlarmInfo(
                id=info['id'],
                title=info['title'],
                headline=info['headline'],
                description=info['description'],
                effective_time=info['effective'].replace('/', '-'),
                geo=GeoPoint(
                    lat=float(lat if lat else 0),
                    lon=float(lon if lon else 0)
                )
            ))
        return AlarmResult(success=True, alarms=alarms)
    
    @staticmethod
    def req_city_id(name:str) -> List[CityID]:
        """
        根据城市名称、缩写、拼音请求对应的城市ID列表. 中国气象局.
        若查询结果不符合预期，请换一个更详细的名称
        
        Args:
            name (str): 要查询的城市名称
            
        Returns:
            List[CityID]: 包含城市ID信息的列表，若查询失败返回空列表
            
        Examples:
            >>> req_city_id("北京") # req_city_id("beijing")
            [CityID(id='...', city_zh='北京', city_en='Beijing', country='中国')]
        """
        name = name.replace('市', '').replace('县', '')
        data = req_json(f'https://weather.cma.cn/api/autocomplete?q={name}')
        if not data.get('msg') == 'success':
            return []
        data: list[str] = data['data']
        result = []
        for city in data:
            info :list[str] = city.split('|')
            if not name in city: continue
            result.append(CityID(
                id=info[0],
                city_zh=info[1],
                city_en=info[2],
                country=info[3]
            ))
        return result
    
    @staticmethod
    def req_now(city_id:int|str|CityID) -> WeatherNow:   
        """
        根据城市ID获取现在的天气信息. 中国气象局. 
        
        Args:
            city_id (int|str|CityID): 城市数字ID或CityID对象
        
        Returns:
            WeatherNow: 包含当前天气数据的对象，若请求失败返回空字典
        """
        if isinstance(city_id, CityID):
            target_id = city_id.id
        else:
            target_id = str(city_id)
        data = req_json(f'https://weather.cma.cn/api/now/{target_id}')
        if not data.get('msg') == 'success':
            return {}
        data: dict[str, str] = data['data']
        now: Dict[str, float] = data['now']
        return WeatherNow(
            precipitation=now['precipitation'],
            temperature=now['temperature'],
            pressure=now['pressure'],
            humidity=now['humidity'],
            wind_degree=now['windDirectionDegree'],
            wind_speed=now['windSpeed'],
            city=CMA.req_city_id(city_id)[0] if isinstance(city_id, str) else city_id,
            time=data['lastUpdate'].replace('/', '-')
        )
    
    @staticmethod
    def req_7d_forecast(city_id:int|str|CityID) -> List[WeatherForecast]:
        """获取指定城市7天天气预报数据（包括今天稍后的预报）. 中国气象局. 
        
        Args:
            city_id (int|str|CityID): 城市的数字ID，或CityID对象
        
        Returns:
            List[WeatherForecast]: 包含7天天气预报数据的列表，每个元素为WeatherForecast对象，
                                  包含日期、白天/夜间天气、温度范围等信息，以及逐小时预报数据
        """
        if isinstance(city_id, CityID):
            target_id = city_id.id
        else:
            target_id = str(city_id)

        html_content = req_content(f'https://weather.cma.cn/web/weather/{target_id}.html')

        soup = BeautifulSoup(html_content, 'html.parser')
        forecasts = []
        
        # 解析7天预报
        days = soup.select('#dayList > .day')
        for day in days:
            items = day.select('.day-item')
            
            # 提取基础数据
            date_info = list(items[0].stripped_strings)
            temp_bar = items[5].select_one('.bar')
            
            forecast = WeatherForecast(
                date=f"{date_info[0]} {date_info[1]}",
                day_weather=items[2].get_text(strip=True),
                day_wind=f"{items[3].get_text(strip=True)} {items[4].get_text(strip=True)}",
                night_weather=items[7].get_text(strip=True),
                night_wind=f"{items[8].get_text(strip=True)} {items[9].get_text(strip=True)}",
                high=temp_bar.select_one('.high').get_text(strip=True),
                low=temp_bar.select_one('.low').get_text(strip=True)
            )
            
            forecasts.append(forecast)
        
        # 解析小时数据
        tables = soup.select('table.hour-table')
        for idx, table in enumerate(tables):
            # 只处理与天数匹配的表格
            if idx >= len(forecasts):
                continue
                
            # 解析表格数据
            data_dict = {}
            for row in table.select('tr'):
                cells = row.select('td')
                header = cells[0].get_text(strip=True)
                header = header.replace(' ', '')  # 清理表头
                
                # 跳过天气图标列
                if '天气' in header:
                    continue
                    
                values = [cell.get_text(strip=True) for cell in cells[1:]]
                data_dict[header] = values
            
            # 构建小时预报对象
            time_slots = data_dict.get('时间', [])
            for i in range(len(time_slots)):
                forecasts[idx].hours.append(HourlyForecast(
                    time=time_slots[i],
                    temperature=data_dict.get('气温', [''])[i],
                    precipitation=data_dict.get('降水', [''])[i],
                    wind_speed=data_dict.get('风速', [''])[i],
                    wind_direction=data_dict.get('风向', [''])[i],
                    pressure=data_dict.get('气压', [''])[i],
                    humidity=data_dict.get('湿度', [''])[i],
                    cloudiness=data_dict.get('云量', [''])[i]
                ))
        
        return forecasts