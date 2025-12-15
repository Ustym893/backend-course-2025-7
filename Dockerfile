# Використовуємо Node.js
FROM node:18-alpine

# Робоча директорія в контейнері
WORKDIR /app

# Копіюємо package.json та встановлюємо залежності
COPY package.json package-lock.json* ./
RUN npm install
# Встановлюємо nodemon глобально або використовуємо локальний (як в завданні)
RUN npm install -g nodemon 

# Копіюємо весь код
COPY . .

# Відкриваємо порт (для документації)
EXPOSE 3000
EXPOSE 9229 

# Команда запуску (буде перевизначена в compose для dev режиму)
CMD ["node", "index.js"]