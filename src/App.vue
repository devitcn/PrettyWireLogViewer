<script setup>
// This starter template is using Vue 3 <script setup> SFCs
// Check out https://vuejs.org/api/sfc-script-setup.html#script-setup


</script>
<script>
function hasText(a){
  return typeof(a) == 'string' && a.length >0;
}
/**parse one  log */
class WireLogParser{
  #lines=[];
  first=""
  headers=[]
  /**@type {string} */
  body
  #context="first";
  #bodyRaw
  
  append(line){
    line = line.replaceAll("[\\r][\\n]","\r\n");
    if(this.#context=="first"){
      this.first=line;
      this.#context="header";
    }else if(this.#context=="header"){
      if(line=="\r\n"){
        this.#context="body"
      }
      this.headers.push(line);
    }else{
      if(this.body==undefined){
        this.body = line;
      }else{
        this.body+=line;
      }
    }
  }
  seal(){
    if(this.body!=null){
      if(this.body.includes("[0x")){//to decode binary string.
        this.#bodyRaw = this.body;
        this.body = this.decodeUt8(this.#bodyRaw);
        //TODO is utf8
      }
    }
  }
  decodeUt8(raw){
    let p=/\[(0x\w{1,2})\]/g;
    let rightIndex = 0;
    let bt=[]; 
    let m;
    while( (m = p.exec(raw)) !=null ){
      if(rightIndex>=0 && rightIndex< m.index){
        let ascii = raw.substring(rightIndex,m.index);
        for(let i =0;i<ascii.length;i++){
          bt.push(ascii.charCodeAt(i));
        }
      }
      bt.push(Number.parseInt(m[1]));
      rightIndex = p.lastIndex;
    }
    if(rightIndex+1<raw.length){
      let ascii = raw.substring(rightIndex);
      for(let i =0;i<ascii.length;i++){
        bt.push(ascii.charCodeAt(i));
      }
    }
    let u8 = new Uint8Array(bt);
    let str = new TextDecoder().decode(u8);
    return str;
  }

  toString(){
    return this.#lines.map(it=>it.line).join("");
  }

  asText(){
    return this.first+""+this.headers.join("")+""+(this.body==undefined?"":this.body)+"\n";
  }
}

/**group of parser */
class ParserManager{
  /**
   * key is thread group
   * value is parser context; {
   *   queue[] parsed log.
   *   parser this parser.
   *   inout
   * }
   */
  #pool= new Map()

  /**
   * 
   * @param {string} thread eg. http-outgoing-0
   * @param {string} outOrIn enum: >> or <<
   * @param {*} line raw log text.
   */
  append(thread,inout,raw){
    if(!this.#pool.has(thread)){this.#createThreadContext(thread,inout)};
    let c = this.#pool.get(thread);
    if(c.inout == inout){
      //same context;
      c.parser.append(raw);
    }else{
      c.inout = inout;
      c.newParser();
      c.parser.append(raw);
      //seal and create new context;
    }
  }

  #createThreadContext(thread,outOrIn){
    this.#pool.set(thread,{
      queue:[],
      parser:new WireLogParser(),
      inout:outOrIn,
      newParser(){
        this.parser.seal();
        this.queue.push(this.parser);
        this.parser=new WireLogParser();
      }
    })
  }
  doFinal(){
    for (const [key, value] of this.#pool) {
      value.parser.seal();
      value.queue.push(value.parser);
      value.parser=null;
    }
    
  }

  collect(){
    let str = "";
    for (const value of this.#pool.values()) {
      value.queue.forEach(p=>{
        str+=p.asText()
      })
    }
    return str;
  }
}
export default {
  data() {
    return {
      form:{rawText:"",wrap:true}
    }
  },
  computed:{
    parsedText(){
      if(!hasText(this.form.rawText)){
        return "解析的报文会显示在此处"
      }else{
        let m = new ParserManager();
        var lines = this.form.rawText.split(/\r?\n/);
        lines.forEach(line=>{
          if (!line.match(/org\.apache\.http\.wire/)) {
              return;
          }
          let found = line.match(/.*http-outgoing-([0-9]+) >> ("?)(.*)\2/);
          if (found) {
            m.append(found[1],">>",found[3])
          }
          // for response
          found = line.match(/[.]wire.+http-outgoing-([0-9]+) << ("?)(.*)\2/);
          if (found) {
              m.append(found[1],"<<",found[3])
          }
        });
        m.doFinal();
        let text = m.collect();
        if(hasText(text)){
          return text;
        }
        return `没找到。你应该将类似：
17:25:27.278 [main] DEBUG org.apache.http.wire - http-outgoing-0 >> "GET /api/foo?bar=123&buz=456 HTTP/1.1[\\r][\\n]
的日志文本粘贴到左侧`
      }
    }
  }
}
</script>
<template>
  <header>
    <h1>Apache Http Client Wrie Log Parser</h1>
  </header>
  <div style="text-align: left;" ><input type="checkbox" v-model="form.wrap"> 折行</div>
  <main style="display: flex; flex-direction: row; min-height: 500px; align-items: stretch;">
    <fieldset style="flex-grow: 1;flex-basis: 50%;">
      <legend style="text-align: left;">Paste Log Here: </legend>
      <textarea :style="[form.wrap?'':'white-space: nowrap']" spellcheck="false" class="fill" v-model="form.rawText" ></textarea>
    </fieldset>
    <fieldset style="flex-grow: 1; flex-basis: 50%;">
      <legend style="text-align:left">Parsed Text</legend>
      <textarea :style="[form.wrap?'':'white-space: nowrap']" spellcheck="false" class="fill" readonly v-model="parsedText" ></textarea>
    </fieldset>
  </main>
  <footer></footer>
</template>

<style>
.fill{
  width:100%; height:100%; 
  text-align: left; overflow: auto; 
  font-family: 'Courier New', Courier, monospace; 
}
</style>
