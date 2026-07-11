/**
 * Options 入口
 *
 * 复用 popup/App 组件，样式更宽。
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../popup/App';
import '../popup/styles.css';

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
