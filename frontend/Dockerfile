# Use Node.js environment
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy dependency definitions
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the frontend code
COPY . .

# Expose the port React runs on
EXPOSE 3000

# Command to run the frontend
CMD ["npm", "start"]