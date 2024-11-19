<template>
  <div>
    <input
      type="file"
      @change="handleFileChange"
      :disabled="status !== Status.wait"
    />
    <el-button @click="handleUpload" :disabled="uploadDisabled"
      >upload</el-button
    >

    <el-button @click="handleResume" v-if="status === Status.pause"
      >resume</el-button
    >
    <el-button
      @click="handlePause"
      v-else
      :disabled="status !== Status.uploading || !container.hash"
      >pause</el-button
    >

    <p>hash进度</p>
    <el-progress :percentage="hashPercentage" style="width: 50%" />
    <p>总进度</p>
    <el-progress :percentage="fakeUploadPercentage" style="width: 50%" />
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
const Status = {
  wait: "wait",
  pause: "pause",
  uploading: "uploading",
};

export default {
  data() {
    return {
      Status,
      container: {
        file: null,
      },
      data: [],
      hashPercentage: 0,
      isPause: false,
      requestList: [],
      status: Status.wait,
      fakeUploadPercentage: 0,
    };
  },
  mounted() {},
  computed: {
    uploadDisabled() {
      return (
        !this.container.file ||
        [Status.pause, Status.uploading].includes(this.status)
      );
    },
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
    calculateHash(fileChunkList) {
      return new Promise((resolve) => {
        // 添加 worker 属性
        this.container.worker = new Worker("/worker.js");
        this.container.worker.postMessage({ fileChunkList });
        this.container.worker.onmessage = (e) => {
          const { percentage, hash } = e.data;
          this.hashPercentage = percentage.toFixed(2);
          if (hash) {
            resolve(hash);
          }
        };
      });
    },
    async verifyUpload(filename, fileHash) {
      const { data } = await this.request({
        url: "http://localhost:5174/verify",
        headers: {
          "content-type": "application/json",
        },
        data: JSON.stringify({
          filename,
          fileHash,
        }),
      });
      return JSON.parse(data);
    },

    async handleUpload() {
      if (!this.container.file) return;
      this.status = Status.uploading;
      const fileChunkList = this.cutFile(this.container.file);
      // 通过worker计算文件hash
      this.container.hash = await this.calculateHash(fileChunkList);
      const { shouldUpload, uploadedList } = await this.verifyUpload(
        this.container.file.name,
        this.container.hash
      );
      if (!shouldUpload) {
        this.$message.success("秒传成功");
        this.status = Status.wait;
        return;
      }
      this.data = fileChunkList.map(({ file }, index) => ({
        fileHash: this.container.hash,
        hash: this.container.hash + "-" + index,
        chunk: file,
        index,
        size: SIZE,
        percentage: uploadedList.includes(index) ? 100 : 0,
      }));
      await this.uploadChunkList(uploadedList);
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
          if (requestList) {
            console.log("🚀 ~ returnnewPromise ~ requestList:", requestList);
            // 删除已经上传成功的切片
            let xhrIndex = requestList.findIndex((item) => item === xhr);
            requestList.splice(xhrIndex, 1);
          }
          resolve({
            data: e.target.response,
          });
        };
        // 暴露当前 xhr 给外部
        requestList?.push(xhr);
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
    async uploadChunkList(uploadedList = []) {
      const requestList = this.data
        .filter(({ hash }) => !uploadedList.includes(hash))
        .map(({ chunk, hash, index, fileHash }) => {
          const formData = new FormData();
          formData.append("chunk", chunk);
          formData.append("fileHash", fileHash);
          formData.append("filename", this.container.file.name);
          formData.append("hash", hash);
          return { formData, index };
        })
        .map(({ formData, index }) =>
          this.request({
            url: "http://localhost:5174",
            data: formData,
            onProgress: this.createProgressHandler(this.data[index]),
            requestList: this.requestList,
          })
        );
      await Promise.all(requestList);
      // 之前上传的切片数量 + 本次上传的切片数量 = 所有切片数量时合并切片
      if (uploadedList.length + requestList.length === this.data.length) {
        await this.mergeChunk();
      }
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
          fileHash: this.container.hash,
          size: SIZE,
        }),
      });
      this.$message.success("upload success, check /target directory");
      this.status = Status.wait;
    },
    createProgressHandler(item) {
      return (e) => {
        item.percentage = parseInt(String((e.loaded / e.total) * 100));
      };
    },
    handlePause() {
      this.status = Status.pause;
      this.requestList.forEach((xhr) => xhr?.abort());
      this.requestList = [];
    },
    async handleResume() {
      this.status = Status.uploading;
      const { uploadedList } = await this.verifyUpload(
        this.container.file.name,
        this.container.hash
      );
      await this.uploadChunkList(uploadedList);
    },
  },
  watch: {
    uploadPercentage(now) {
      if (now > this.fakeUploadPercentage) {
        this.fakeUploadPercentage = now;
      }
    },
  },
};
</script>
<style scoped></style>
