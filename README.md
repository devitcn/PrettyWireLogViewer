PrettyWireLogViewer 
===================

Pretty viewer for wire logging of Apache [HttpClient](http://hc.apache.org/)

解析 [Apache HttpClient](http://hc.apache.org/) 输出的log中的http报文。

- 提取log `org.apache.http.wire`
- 尝试将类似`[0x0A]`的HEX代码按UTF8字符串编码

例子：

```11:14:13.080 DEBUG [main] org.apache.http.wire  : http-outgoing-0 << "[0xe6][0xb1][0x89][0xe5][0xad][0x97]"```

将会解码为：

```汉字```

Getting Started
---------------

[演示地址](https://devitcn.github.io/PrettyWireLogViewer/)


Requirements
------------

- Browser which supports replaceState

For Developers
--------------

Way to setup development environment:

```
$ npm install
$ npm run dev
$ npm run build
```

运行依赖：

- Vue3
- TextDecoder

构建依赖：

- Vite

Author
------

Alex Lei 

moznion moznion@gmail.com 

tokuhirom

License
-------

MIT. as original repo [moznion/PrettyWireLogViewer](https://github.com/moznion/PrettyWireLogViewer)

Favicon : [Toolbox icons created by Freepik - Flaticon](https://www.flaticon.com/free-icons/toolbox)


