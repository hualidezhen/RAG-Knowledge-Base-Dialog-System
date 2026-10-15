/**
 * 服务器入口文件，从 app.ts 导入 Express 实例并启动 HTTP 监听
 */
import dotenv from 'dotenv';
dotenv.config();

import { app } from './app';

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
server.timeout = 300000; // 5 分钟超时，用于大文件上传

export { app };
