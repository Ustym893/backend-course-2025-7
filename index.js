// index.js

import { Command } from 'commander';
import express from 'express';
import multer from 'multer';
import * as fs from 'fs/promises';
import * as path from 'path';
import swaggerUi from 'swagger-ui-express'; 
import swaggerJsdoc from 'swagger-jsdoc';

// --- COMMANDER CONFIG ---
const program = new Command();

program
    .requiredOption('-h, --host <address>', 'Адреса сервера (обов\'язковий)')
    .requiredOption('-p, --port <number>', 'Порт сервера (обов\'язковий)', parseInt)
    .requiredOption('-c, --cache <path>', 'Шлях до директорії кешованих файлів (обов\'язковий)')
    .allowUnknownOption();

program.parse(process.argv);

let { host, port, cache } = program.opts();
cache = path.resolve(cache);

// --- DATA STORE ---
let inventoryItems = {};
let nextId = 1;

// --- INIT CACHE DIR ---
async function initializeCache(dirPath) {
    try {
        await fs.access(dirPath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(dirPath, { recursive: true });
        } else {
            console.error(`Помилка доступу до кешу: ${error.message}`);
            process.exit(1);
        }
    }
}

// --- MULTER STORAGE ---
const uploadStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, cache),
    filename: (req, file, cb) =>
        cb(null, `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`)
});
const upload = multer({ storage: uploadStorage });

// --- HELPERS ---
const prepareItemResponse = item => ({
    ID: item.ID,
    InventoryName: item.InventoryName,
    Description: item.Description,
    PhotoLink: item.Photo ? `/inventory/${item.ID}/photo` : null
});

const findItem = (id, res) => {
    const item = inventoryItems[id];
    if (!item) {
        res.status(404).json({ error: `Річ з ID ${id} не знайдена` });
        return null;
    }
    return item;
};

// --- EXPRESS APP ---
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------
// SWAGGER CONFIG
// ---------------------------------------------------

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Inventory Service API',
            version: '1.0.0',
            description: 'Документація для сервісу інвентаризації.',
        },
        servers: [{ url: `http://${host}:${port}` }],
    },
    apis: ['./index.js'],
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));


// ---------------------------------------------------
// 1. СХЕМИ ТА ТЕГИ
// ---------------------------------------------------

/**
 * @swagger
 * components:
 *   schemas:
 *     InventoryItem:
 *       type: object
 *       properties:
 *         ID:
 *           type: integer
 *         InventoryName:
 *           type: string
 *         Description:
 *           type: string
 *         PhotoLink:
 *           type: string
 */

/**
 * @swagger
 * tags:
 *   - name: Inventory
 *     description: "Управління інвентаризацією"
 *   - name: Forms
 *     description: "HTML форми"
 */


// ---------------------------------------------------
// 2. REGISTER (POST)
// ---------------------------------------------------

/**
 * @swagger
 * /register:
 *   post:
 *     tags: [Inventory]
 *     summary: "Реєстрація нового пристрою"
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: "Успішно створено"
 *       400:
 *         description: "Невірний запит"
 */
app.post('/register', upload.single('photo'), (req, res) => {
    const { inventory_name, description } = req.body;
    let photoFilename = req.file ? req.file.filename : null;

    if (!inventory_name) {
        if (photoFilename) {
            fs.unlink(path.join(cache, photoFilename)).catch(console.error);
        }
        return res.status(400).json({ error: "Поле inventory_name є обов'язковим." });
    }

    const newId = nextId++;
    inventoryItems[newId] = {
        ID: newId,
        InventoryName: inventory_name,
        Description: description || '',
        Photo: photoFilename,
    };

    res.status(201).json({
        message: 'Інвентар успішно зареєстровано',
        item: prepareItemResponse(inventoryItems[newId])
    });
});


// ---------------------------------------------------
// 3. GET /inventory
// ---------------------------------------------------

/**
 * @swagger
 * /inventory:
 *   get:
 *     tags: [Inventory]
 *     summary: "Отримання списку всіх інвентаризованих речей"
 *     responses:
 *       200:
 *         description: "Успішне повернення списку"
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/InventoryItem'
 */
app.get('/inventory', (req, res) => {
    const list = Object.values(inventoryItems).map(prepareItemResponse);
    res.status(200).json(list);
});


// ---------------------------------------------------
// 4. GET /inventory/{id}
// ---------------------------------------------------

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     tags: [Inventory]
 *     summary: "Отримання інформації про конкретну річ"
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: "Унікальний ідентифікатор інвентаризованої речі"
 *     responses:
 *       200:
 *         description: "Успішне повернення інформації"
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InventoryItem'
 *       404:
 *         description: "Річ не знайдена"
 */
app.get('/inventory/:id', (req, res) => {
    const item = findItem(parseInt(req.params.id), res);
    if (!item) return;
    res.status(200).json(prepareItemResponse(item));
});


// ---------------------------------------------------
// 5. PUT /inventory/{id}
// ---------------------------------------------------

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     tags: [Inventory]
 *     summary: "Оновлення імені або опису"
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: "Унікальний ідентифікатор інвентаризованої речі"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               InventoryName:
 *                 type: string
 *               Description:
 *                 type: string
 *     responses:
 *       200:
 *         description: "Успішно оновлено"
 *       404:
 *         description: "Річ не знайдена"
 */
app.put('/inventory/:id', (req, res) => {
    const item = findItem(parseInt(req.params.id), res);
    if (!item) return;

    const { InventoryName, Description } = req.body;

    if (InventoryName !== undefined) item.InventoryName = InventoryName;
    if (Description !== undefined) item.Description = Description;

    res.status(200).json(prepareItemResponse(item));
});


// ---------------------------------------------------
// 6. DELETE /inventory/{id}
// ---------------------------------------------------

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     tags: [Inventory]
 *     summary: "Видалення інвентаризованої речі"
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: "Унікальний ідентифікатор інвентаризованої речі"
 *     responses:
 *       200:
 *         description: "Успішно видалено"
 *       404:
 *         description: "Річ не знайдена"
 */
app.delete('/inventory/:id', async (req, res) => {
    const item = findItem(parseInt(req.params.id), res);
    if (!item) return;

    if (item.Photo) {
        await fs.unlink(path.join(cache, item.Photo)).catch(console.error);
    }

    delete inventoryItems[item.ID];
    res.status(200).json({ message: `Річ з ID ${item.ID} успішно видалена` });
});


// ---------------------------------------------------
// 7. GET /inventory/{id}/photo
// ---------------------------------------------------

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     tags: [Inventory]
 *     summary: "Отримання фото зображення"
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: "ID речі"
 *     responses:
 *       200:
 *         description: "Зображення повернено у форматі image/jpeg"
 *       404:
 *         description: "Річ або фото не знайдено"
 */
app.get('/inventory/:id/photo', (req, res) => {
    const id = parseInt(req.params.id);
    const item = inventoryItems[id];

    if (!item || !item.Photo) {
        return res.status(404).json({ error: `Фото для ID ${id} не знайдено` });
    }

    const photoPath = path.join(cache, item.Photo);

    res.setHeader('Content-Type', 'image/jpeg');

    res.sendFile(photoPath, {}, err => {
        if (err) {
            console.error(`Помилка: ${err.message}`);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Помилка сервера' });
            }
        }
    });
});


// ---------------------------------------------------
// 8. PUT /inventory/{id}/photo
// ---------------------------------------------------

/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     tags: [Inventory]
 *     summary: "Оновлення фото зображення"
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: "ID речі"
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: "Успішно оновлено"
 *       400:
 *         description: "Файл не надано"
 *       404:
 *         description: "Річ не знайдена"
 */
app.put('/inventory/:id/photo', upload.single('photo'), async (req, res) => {
    const item = findItem(parseInt(req.params.id), res);
    if (!item) return;

    if (!req.file) {
        return res.status(400).json({ error: 'Файл фото не надано' });
    }

    if (item.Photo) {
        await fs.unlink(path.join(cache, item.Photo)).catch(console.error);
    }

    item.Photo = req.file.filename;

    res.status(200).json({
        message: `Фото для ID ${item.ID} успішно оновлено`,
        item: prepareItemResponse(item),
    });
});


// ---------------------------------------------------
// 9. ФОРМИ HTML
// ---------------------------------------------------

/**
 * @swagger
 * /RegisterForm.html:
 *   get:
 *     tags: [Forms]
 *     summary: "Веб форма для реєстрації пристрою"
 *     responses:
 *       200:
 *         description: "Повертає HTML-форму"
 */
app.get('/RegisterForm.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'RegisterForm.html'));
});

/**
 * @swagger
 * /SearchForm.html:
 *   get:
 *     tags: [Forms]
 *     summary: "Веб форма для пошуку пристрою"
 *     responses:
 *       200:
 *         description: "Повертає HTML-форму"
 */
app.get('/SearchForm.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'SearchForm.html'));
});


// ---------------------------------------------------
// 10. POST /search
// ---------------------------------------------------

/**
 * @swagger
 * /search:
 *   post:
 *     tags: [Forms]
 *     summary: "Обробка запиту пошуку пристрою за ID"
 *     requestBody:
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *                 description: "Поле для введення серійного номеру/ID"
 *               has_photo:
 *                 type: string
 *                 description: "Прапорець для додавання посилання на фото"
 *     responses:
 *       200:
 *         description: "Успішно знайдено інформацію"
 *       404:
 *         description: "Річ не знайдена"
 */
app.post('/search', (req, res) => {
    const { id, has_photo } = req.body;
    const itemId = parseInt(id);
    const item = inventoryItems[itemId];

    if (!item) {
        return res.status(404).json({ error: `Річ з ID ${id} не знайдена` });
    }

    const responseItem = {
        ID: item.ID,
        InventoryName: item.InventoryName,
        Description: item.Description,
    };

    if (has_photo === 'on' && item.Photo) {
        responseItem.PhotoLink = `/inventory/${item.ID}/photo`;
    }

    res.status(200).json(responseItem);
});


// ---------------------------------------------------
// 11. ERROR HANDLERS
// ---------------------------------------------------

app.use((req, res, next) => {
    const allowed = ['GET', 'POST', 'PUT', 'DELETE'];
    if (!allowed.includes(req.method)) {
        return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }
    next();
});

app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});


// ---------------------------------------------------
// 12. START SERVER
// ---------------------------------------------------

async function startServer() {
    try {
        await initializeCache(cache);

        app.listen(port, host, () => {
            console.log('--- СЕРВЕР ЗАПУЩЕНО ---');
            console.log(`http://${host}:${port}`);
            console.log(`Swagger UI: http://${host}:${port}/docs`);
            console.log(`Кеш: ${cache}`);
            console.log('------------------------');
        });
    } catch (e) {
        console.error('Критична помилка:', e);
        process.exit(1);
    }
}

startServer();