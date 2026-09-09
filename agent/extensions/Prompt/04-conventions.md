## 开发规范

- 只写解决问题所需的最少代码,不要添加假想式功能,不要提前做过度抽象。
- 只改导致问题的代码,不要顺便优化、修改其他地方的代码、注释、格式、接口签名。没坏的或没有要求修改的东西不要动,修改的地方遵循现有风格和实现方式。
- 当代码库中存在两种互相冲突的做法时,不要混合冲突的代码模式。只选择一种(通常选更新的、测试更充分的),解释选择理由,并将另一种标记出来以便后续清理。
- 前端项目尽可能使用 `pnpm` 管理依赖和运行脚本。
- Python 项目使用 `uv` 运行程序和管理依赖。
- 添加依赖必须使用包管理命令,例如 `pnpm add`、`uv add`,禁止手工修改 `package.json`、`pyproject.toml` 等依赖清单。
- 禁止使用 `apply_patch` 命令。
- 除非确有必要,避免编写大量无实际用途的文档,例如"修改总结"。
- Python 代码必须使用类型注解。
- Python 项目按改动影响选择验证方式:行为变更优先补充针对性回归测试,纯文档、静态资源、格式化和无行为配置不编写虚假测试。
- pytest 与 py_compile 使用以下形式:

```bash
uv run python -m py_compile path/to/file.py
uv run python -m compileall -q .
uv run --with pytest pytest -q
uv run --with pytest pytest tests/test_example.py
uv run --with pytest python -m pytest
```

- 注释解释原因,避免解释显而易见的语句。
- 公共函数、类、模块提供简洁 docstring,说明用途、参数和返回值。
- 复杂算法保留必要步骤说明,帮助维护者理解关键判断。
- 临时方案使用 `TODO:` 或 `FIXME:` 标记,并说明采用该方案的原因。

## 技能路由

同一请求命中多个技能时,先按交付格式和任务性质选择一个主技能,再按主技能明确引用的依赖加载辅助技能。默认路由如下:

- `PPTX` 或 Google Slides: `presentations`
- 技术演示或代码讲解网页幻灯片: `slidev`
- 横向翻页单文件 HTML 幻灯片: `guizang-ppt-skill`
- PDF 阅读、创建、表单或版式检查: `pdf`
- 海报、艺术作品或静态视觉设计: `canvas-design`
- 简历、一页纸、白皮书、编辑型 PDF 或产品落地页: `kami`
- 网站项目且存在 `.openai/hosting.json`: `sites-building`,发布操作再加载 `sites-hosting`
- 普通事实检索: `search-layer`
- URL 转 Markdown: `content-extract`;只有解析失败或需要高保真 OCR、表格、公式时再加载 `mineru-extract`

已有项目的技术栈和用户明确指定的格式优先于默认路由。
