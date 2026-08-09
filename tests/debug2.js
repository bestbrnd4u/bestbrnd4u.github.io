const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
const { window } = dom;
let fired = false;
window.requestAnimationFrame(() => { fired = true; console.log("rAF fired synchronously"); });
console.log("immediately after schedule, fired =", fired);
setTimeout(() => console.log("after setTimeout(0), fired =", fired), 0);
