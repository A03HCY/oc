class CMA {
    static async req_alarm() {
        try {
            const response = await fetch('https://cors-anywhere.herokuapp.com/https://weather.cma.cn/api/map/alarm', {
                headers: {
                    'Referer': 'https://weather.cma.cn/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();

            if (result.msg !== 'success') {
                console.error("API did not return success for req_alarm:", result);
                return JSON.stringify({ success: false, alarms: [] });
            }

            const alarms = result.data.map(info => ({
                id: info.id,
                title: info.title,
                headline: info.headline,
                description: info.description,
                effective_time: info.effective.replace(/\//g, '-'),
                geo: {
                    lat: parseFloat(info.latitude || 0),
                    lon: parseFloat(info.longitude || 0)
                }
            }));
            return JSON.stringify({ success: true, alarms: alarms });
        } catch (error) {
            console.error('Error fetching alarm data:', error);
            return JSON.stringify({ success: false, alarms: [] });
        }
    }

    static async req_city_id(name) {
        const cityName = name.replace(/市|县/g, '');
        try {
            const response = await fetch(`https://cors-anywhere.herokuapp.com/https://weather.cma.cn/api/autocomplete?q=${encodeURIComponent(cityName)}`, {
                headers: {
                    'Referer': 'https://weather.cma.cn/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            if (data.msg !== 'success') {
                console.error("API did not return success for req_city_id:", data);
                return "[]";
            }

            const cityList = data.data
                .map(city => {
                    const info = city.split('|');
                    return {
                        id: info[0],
                        city_zh: info[1],
                        city_en: info[2],
                        country: info[3]
                    };
                })
                .filter(cityInfo => city.includes(cityName));
            return JSON.stringify(cityList);
        } catch (error) {
            console.error('Error fetching city ID:', error);
            return "[]";
        }
    }

    static async req_now(city_id) {
        const target_id = typeof city_id === 'object' ? city_id.id : String(city_id);
        try {
            const response = await fetch(`https://cors-anywhere.com/https://weather.cma.cn/api/now/${target_id}`, {
                headers: {
                    'Referer': 'https://weather.cma.cn/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            if (data.msg !== 'success') {
                console.error("API did not return success for req_now:", data);
                return "{}";
            }

            const now = data.data.now;
            const cityData = typeof city_id === 'object' ? city_id : JSON.parse(await this.req_city_id(city_id))[0];

            return JSON.stringify({
                precipitation: now.precipitation,
                temperature: now.temperature,
                pressure: now.pressure,
                humidity: now.humidity,
                wind_degree: now.windDirectionDegree,
                wind_speed: now.windSpeed,
                city: cityData,
                time: data.data.lastUpdate.replace(/\//g, '-')
            });
        } catch (error) {
            console.error('Error fetching current weather:', error);
            return "{}";
        }
    }
}
