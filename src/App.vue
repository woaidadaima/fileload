<template>
  <div>
    <input type="file" @change="handleFileChange" />
    <el-button @click="handleUpload">upload</el-button>
  </div>
</template>
<script>
const SIZE = 100 * 1024 * 1024;
export default {
  data() {
    return {
      container: {
        file: null,
      },
      data: [],
    };
  },
  mounted() {},

  methods: {
    handleFileChange(e) {
      const [file] = e.target.files;
      if (!file) return;
      this.container.file = file;
      console.log("🚀 ~ handleFileChange ~ e:", file);
    },
    async handleUpload() {
      if (!this.container.file) return;
      const fileChunkList = this.cutFile(this.container.file);
      this.data = fileChunkList.map(({ file }, index) => ({
        chunk: file,
        hash: this.container.file.name + "-" + index,
      }));
      await this.uploadChunkList();
    },

    request({ url, methods = "post", headers = {}, data, requestList }) {
      return new Promise((resolve) => {
        let xhr = new XMLHttpRequest();
        xhr.open(methods, url);
        Object.keys(headers).forEach((item) =>
          xhr.setRequestHeader(item, headers[item])
        );
        xhr.send(data);
        xhr.onload = (e) => {
          console.log("🚀 ~ returnnewPromise ~ e:", e);
          resolve({
            data: e.target.response,
          });
        };
      });
    },
    //对文件切片
    cutFile(file, size = SIZE) {
      let cur = 0;
      let fileChunkList = [];
      while (cur < file.size) {
        fileChunkList.push({ file: file.slice(cur, cur + size) });
        cur += size;
      }
      return fileChunkList;
    },
    //上传切片文件
    async uploadChunkList() {
      const requestList = this.data
        .map(({ chunk, hash }) => {
          const formData = new FormData();
          formData.append("chunk", chunk);
          formData.append("hash", hash);
          formData.append("filename", this.container.file.name);

          return { formData };
        })
        .map(({ formData }) =>
          this.request({
            url: "http://localhost:5174",
            data: formData,
          })
        );
      await Promise.all(requestList);
      await this.mergeChunk();
    },

    //通知服务端合并切片
    async mergeChunk() {
      await this.request({
        url: "http://localhost:5174/merge",
        headers: {
          "content-type": "application/json",
        },
        data: JSON.stringify({
          filename: this.container.file.name,
          size: SIZE,
        }),
      });
    },
  },
};
</script>
<style scoped></style>
