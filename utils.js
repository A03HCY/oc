async function locate_geo() {
    /**
     * 获取用户的大致地理位置.
     * @returns {Promise<Object>} {'continent': '亚洲', 'country': '中国', 'owner': '...', 'isp': '...', 'prov': '...省', 'city': '...', 'district': '...'}
     */
    try {
        const response = await fetch('https://my.ip.cn/json/');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        
        return JSON.stringify(result.data || {});
    } catch (error) {
        console.error('Error fetching geo location:', error);
        return "{}";
    }
}
