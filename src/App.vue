<template>
  <div>
    <input type="file" @change="handleFileChange" />
    <el-button @click="handleUpload">upload</el-button>
    <p>总进度</p>
    <el-progress :percentage="uploadPercentage" style="width: 50%" />
    <p>分进度</p>
    <el-table :data="data" style="width: 50%; height: 700px">
      <el-table-column prop="hash" label="chunkHash" width="180" />
      <el-table-column label="size(kb)" width="180">
        <template #default="{ row }">
          <div>{{ row.size }}</div>
        </template>
      </el-table-column>
      <el-table-column label="percentage">
        <template #default="{ row }">
          <el-progress :percentage="row.percentage" />
        </template>
      </el-table-column>
    </el-table>
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
  computed: {
    uploadPercentage() {
      // debugger;
      if (!this.container.file || !this.data.length) return 0;
      const loaded = this.data
        .map((item) => item.size * item.percentage)
        .reduce((acc, cur) => acc + cur);
      console.log("🚀 ~ uploadPercentage ~ loaded:", loaded);

      return parseInt((loaded / this.container.file.size).toFixed(2));
    },
  },
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
        index,
        size: SIZE,
        percentage: 0,
        hash: this.container.file.name + "-" + index,
      }));
      await this.uploadChunkList();
    },

    request({
      url,
      methods = "post",
      headers = {},
      data,
      requestList,
      onProgress = (e) => e,
    }) {
      return new Promise((resolve) => {
        let xhr = new XMLHttpRequest();
        xhr.upload.onprogress = onProgress;
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
        .map(({ chunk, hash, index }) => {
          const formData = new FormData();
          formData.append("chunk", chunk);
          formData.append("hash", hash);
          formData.append("filename", this.container.file.name);

          return { formData, index };
        })
        .map(({ formData, index }) =>
          this.request({
            url: "http://localhost:5174",
            data: formData,
            onProgress: this.createProgressHandler(this.data[index]),
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
    createProgressHandler(item) {
      return (e) => {
        item.percentage = parseInt(String((e.loaded / e.total) * 100));
      };
    },
  },
};
</script>
<style scoped></style>
