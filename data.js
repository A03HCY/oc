// data.js
const DB_NAME = 'ChatDB';
const DB_VERSION = 1;

const STORES = {
    PERSONA: 'persona',
    CHAT: 'chat',
    PROFILE: 'profile',
    MODEL: 'model'
};

class IndexedDB {
    constructor() {
        this.db = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;
                this.createStores(db, oldVersion);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.initialized = true;
                resolve();
            };

            request.onerror = (event) => {
                reject(new Error(`DB Init failed: ${event.target.error}`));
            };
        });
    }

    createStores(db, oldVersion = 0) {
        // 初次创建
        if (oldVersion < 1) {
            // Persona 存储
            db.createObjectStore(STORES.PERSONA, {
                keyPath: 'name',
                autoIncrement: false
            });

            // Chat 存储
            const chatStore = db.createObjectStore(STORES.CHAT, {
                keyPath: 'id',
                autoIncrement: true
            });
            chatStore.createIndex('created', 'created', { unique: false });

            // Profile 存储
            db.createObjectStore(STORES.PROFILE, { keyPath: 'id' });

            // Model 存储
            db.createObjectStore(STORES.MODEL, { keyPath: 'id' });
        }
    }

    //====================== 图片处理功能 ======================
    /**
     * 将File或Blob对象转换为Base64字符串
     * @param {File|Blob} file - 要转换的图片文件
     * @returns {Promise<string>} Base64编码的图片数据
     */
    convertImageToBase64(file) {
        return new Promise((resolve, reject) => {
            if (!(file instanceof Blob)) {
                reject(new Error('无效的文件对象'));
                return;
            }

            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
        });
    }

    /**
     * 从文件输入控件中获取图片并转换为Base64
     * @param {HTMLInputElement} fileInput - 文件输入控件
     * @returns {Promise<string|null>} - Base64编码的图片数据或null
     */
    async getImageFromInput(fileInput) {
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            return null;
        }

        const file = fileInput.files[0];
        // 验证是否为图片
        if (!file.type.startsWith('image/')) {
            throw new Error('请选择图片文件');
        }

        try {
            return await this.convertImageToBase64(file);
        } catch (error) {
            console.error('图片转换失败', error);
            throw error;
        }
    }

    /**
     * 生成随机颜色的头像
     * @param {string} text - 头像中显示的文本（通常是名称的首字母）
     * @returns {string} - Base64编码的头像数据
     */
    generateColorAvatar(text = '') {
        // 创建一个画布来绘制头像
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');

        // 生成随机颜色
        const hue = Math.floor(Math.random() * 360);
        const bgColor = `hsl(${hue}, 70%, 60%)`;

        // 绘制背景
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 如果有文本，绘制文本
        if (text) {
            ctx.fillStyle = 'white';
            ctx.font = 'bold 100px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text.charAt(0).toUpperCase(), canvas.width / 2, canvas.height / 2);
        }

        // 返回Base64编码的图片数据
        return canvas.toDataURL('image/png');
    }

    /**
     * 选择图片并转换为Base64
     * @returns {Promise<string>} - 返回选择的图片的Base64编码
     */
    selectAndConvertImage() {
        return new Promise((resolve, reject) => {
            // 创建文件输入元素
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';

            // 监听选择事件
            fileInput.addEventListener('change', async () => {
                try {
                    if (fileInput.files && fileInput.files.length > 0) {
                        const base64 = await this.getImageFromInput(fileInput);
                        resolve(base64);
                    } else {
                        reject(new Error('未选择图片'));
                    }
                } catch (error) {
                    reject(error);
                }
            });

            // 模拟点击打开文件选择器
            fileInput.click();
        });
    }

    //====================== Persona 操作 ======================
    async addPersona(persona) {
        return this._put(STORES.PERSONA, persona);
    }

    async getPersona(name) {
        return this._get(STORES.PERSONA, name);
    }

    async getAllPersonas() {
        return this._getAll(STORES.PERSONA);
    }

    async deletePersona(name) {
        return this._delete(STORES.PERSONA, name);
    }

    //====================== Chat 操作 ======================
    async createChat(chatData) {
        const data = {
            ...chatData,
            created: new Date(),
            updated: new Date()
        };
        return this._add(STORES.CHAT, data);
    }

    async getChat(id) {
        return this._get(STORES.CHAT, id);
    }

    async updateChat(id, updates) {
        const chat = await this.getChat(id);
        return this._put(STORES.CHAT, {
            ...chat,
            ...updates,
            updated: new Date()
        });
    }

    async deleteChat(id) {
        return this._delete(STORES.CHAT, id);
    }

    async queryChats({
        persona = null,
        keyword = '',
        page = 1,
        pageSize = 20
    } = {}) {
        this.checkInitialized();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.CHAT], 'readonly');
            const store = transaction.objectStore(STORES.CHAT);
            const index = store.index('created');
            const request = index.openCursor(null, 'prev');

            const results = [];
            let count = 0;
            let skipped = 0;
            const keywordLower = keyword.toLowerCase();

            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (!cursor) {
                    return resolve({
                        data: results,
                        total: results.length,
                        page,
                        pageSize
                    });
                }

                const chat = cursor.value;
                let match = true;

                // 过滤条件
                if (persona && chat.persona !== persona) match = false;
                if (keywordLower) {
                    const titleMatch = chat.title.toLowerCase().includes(keywordLower);
                    const contentMatch = chat.history.some(msg =>
                        msg.content.toLowerCase().includes(keywordLower)
                    );
                    if (!titleMatch && !contentMatch) match = false;
                }

                if (match) {
                    skipped++;
                    if (skipped > (page - 1) * pageSize) {
                        results.push(chat);
                        count++;
                    }
                }

                if (count < pageSize) {
                    cursor.continue();
                } else {
                    resolve({
                        data: results,
                        total: skipped + count,
                        page,
                        pageSize
                    });
                }
            };

            request.onerror = (e) => reject(e.target.error);
        });
    }

    //====================== Profile 操作 ======================
    async saveProfile(profile) {
        return this._put(STORES.PROFILE, {
            ...profile,
            id: 'currentProfile'
        });
    }

    async getProfile() {
        const profile = await this._get(STORES.PROFILE, 'currentProfile');
        return profile || {};
    }

    //====================== Model 操作 ======================
    async saveModels(models) {
        return this._put(STORES.MODEL, {
            id: 'modelList',
            list: models,
            updated: new Date()
        });
    }

    async getModels() {
        const data = await this._get(STORES.MODEL, 'modelList');
        return data?.list || [];
    }

    //====================== 通用方法 ======================
    checkInitialized() {
        if (!this.initialized) {
            throw new Error('Database not initialized. Call init() first.');
        }
    }

    async _operation(storeName, mode, operation) {
        this.checkInitialized();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], mode);
            const store = transaction.objectStore(storeName);

            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => reject(e.target.error);

            const request = operation(store);
            if (request) {
                request.onsuccess = (e) => resolve(e.target.result);
                request.onerror = (e) => reject(e.target.error);
            }
        });
    }

    async _add(storeName, data) {
        return this._operation(storeName, 'readwrite', (store) => store.add(data));
    }

    async _get(storeName, key) {
        return this._operation(storeName, 'readonly', (store) => store.get(key));
    }

    async _put(storeName, data) {
        return this._operation(storeName, 'readwrite', (store) => store.put(data));
    }

    async _delete(storeName, key) {
        return this._operation(storeName, 'readwrite', (store) => store.delete(key));
    }

    async _getAll(storeName) {
        return this._operation(storeName, 'readonly', (store) => store.getAll());
    }
}

// 创建全局单例实例
const DB = new IndexedDB();

DB.init()

// 浏览器全局对象
if (typeof window !== 'undefined') {
    window.DB = DB;
}

// 模块化导出
// export default DB;