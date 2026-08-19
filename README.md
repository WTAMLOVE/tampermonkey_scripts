# Tampermonkey Scripts

个人维护的 Tampermonkey 用户脚本集合。

## 脚本列表

| 脚本 | 简介 |
| --- | --- |
| [Bilibili 稍后再看：单视频置顶](./bilibili-watchlater-pin.user.js) | 在 Bilibili 稍后再看的视频卡片上添加“置顶”按钮，通过重新加入列表使视频排在最近添加的位置。 |

## 安装与使用

1. 在浏览器中安装用户脚本管理器，例如 [Tampermonkey](https://www.tampermonkey.net/)、Violentmonkey 或 Greasemonkey。
2. 打开所需脚本的 `.user.js` 文件，将其内容安装到用户脚本管理器中。
3. 按脚本元数据中的 `@match` 规则访问对应网站；脚本会在匹配的页面自动运行。

## 注意事项

- 用户脚本依赖目标网站当前的页面结构与接口；网站更新后，脚本可能需要适配。
- 请在安装前阅读脚本源码及其所声明的权限。
- 每个脚本的适用范围、权限和行为以其文件头部的 Userscript 元数据及源码为准。

## 开发

本仓库不需要统一构建步骤。修改脚本后，可使用 Node.js 做基础语法检查：

```bash
node --check <script>.user.js
```
