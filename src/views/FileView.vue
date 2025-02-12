<template>
  <div class="file-view">
    <h1>File Management</h1>
    <div class="file-actions">
      <input
        type="file"
        ref="fileInput"
        style="display: none"
        @change="handleFileUpload"
        accept=".csv, .xlsx"
      />
      <button @click="triggerFileUpload">Load File</button>
      <button @click="saveFile">Save File</button>
      <button @click="createNewFile">New File</button>
    </div>
    <p v-if="loading">📂 파일 업로드 중...</p>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script>
import axios from "axios";

export default {
  data() {
    return {
      fileContent: "", // 파일 내용을 저장하는 변수
      loading: false,
      error: null,
    };
  },
  methods: {
    triggerFileUpload() {
      // ✅ 숨겨진 input 클릭하여 파일 선택 창 열기
      this.$refs.fileInput.click();
    },
    async handleFileUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      this.loading = true;
      this.error = null;

      // FormData 생성 후 파일 추가
      const formData = new FormData();
      formData.append("file", file);

      try {
        // ✅ 1. 파일 업로드 요청 (`/api/upload`)
        console.log("📤 파일 업로드 중...");
        const uploadResponse = await axios.post(
          "http://localhost:5000/api/upload",
          formData,
          { headers: { "Content-Type": "multipart/form-data" } },
        );

        console.log("📂 파일 업로드 성공:", uploadResponse.data);

        // ✅ 2. 업로드된 파일을 처리하도록 `/api/process` 요청 (JSON 데이터 전송)
        console.log("⚙️ 파일 처리 중...");
        const processResponse = await axios.post(
          "http://localhost:5000/api/process",
          { filename: uploadResponse.data.filename }, // ✅ FormData 대신 JSON 사용
          { headers: { "Content-Type": "application/json" } },
        );

        console.log("📊 Python 처리 결과:", processResponse.data);

        this.$emit("file-loaded", processResponse.data);
      } catch (err) {
        this.error = "파일 업로드 또는 처리 실패 😢";
        console.error(err);
      } finally {
        this.loading = false;
      }
    },
    saveFile() {
      // 현재 파일 내용을 저장
      const blob = new Blob([this.fileContent], { type: "text/plain" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "newfile.txt";
      link.click();
    },
    createNewFile() {
      this.$emit("create-new-file"); // ✅ App.vue로 이벤트 전송
    },
  },
};
</script>
<style>
.file-view {
  padding: 20px;
}
.file-actions {
  margin-bottom: 20px;
}
.file-actions button {
  margin-right: 10px;
  padding: 10px 20px;
  font-size: 16px;
  cursor: pointer;
  background-color: #333;
  color: white;
  border: none;
  border-radius: 5px;
}
.file-actions button:hover {
  background-color: #f0a500;
}
.error {
  color: red;
  font-weight: bold;
}
</style>
