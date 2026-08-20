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
- Python 项目按测试驱动开发组织实现:先写 pytest 覆盖正常情况、边界情况和异常情况,再小步实现,测试通过后再整理代码。
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
