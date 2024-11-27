//1. 导入 http 模块
import http from 'http'
import Controller from './controller.js';
const server = http.createServer();
const controller = new Controller()
server.on("request", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") {
        res.status = 200;
        res.end();
        return;
    }
    if (req.url === "/merge") {
        await controller.handleMerge(req,res)
    }
    if (req.url === '/verify') {
        await controller.handleVerify(req,res)
    }
    if(req.url === '/delete'){
        await controller.handleDelete(req,res)
       
    }
    if(req.url === '/'){
        await controller.handleFormData(req,res)
    }

});

server.listen(5174, () => console.log("listening port 5174"));
