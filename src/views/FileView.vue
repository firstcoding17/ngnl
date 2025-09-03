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
      <button @click="saveFile('csv')">Save as CSV</button>
      <button @click="saveFile('excel')">Save as Excel</button>
      <button @click="createNewFile">New File</button>
    </div>
    <p v-if="loading">📂 파일 업로드 중...</p>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script>
import axios from "axios";
import * as XLSX from "xlsx";

export default {
  props: {
    tableData: {
      type: Object,
      default: () => null,
    },
  },
  data() {
    return {
      localTableData: null,
      fileContent: "", // 사용하지 않으면 이것도 제거 가능
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
        this.localTableData = processResponse.data;
        this.$emit("file-loaded", processResponse.data);
      } catch (err) {
        this.error = "파일 업로드 또는 처리 실패 😢";
        console.error(err);
      } finally {
        this.loading = false;
      }
    },
    saveFile(format = "csv") {
      console.log("📦 저장할 데이터 확인:", this.localTableData); // ✅ 추가
      if (!this.localTableData) {
        alert("저장할 데이터가 없습니다.");
        return;
      }
      const { columns, rows } = this.localTableData; // ✅
      const data = [columns, ...rows]; // ✅ 컬럼 + 데이터 합치기

      if (format === "csv") {
        const csvContent = data.map((row) => row.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: "text/csv" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "saved_data.csv";
        link.click();
      } else if (format === "excel") {
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        XLSX.writeFile(wb, "saved_data.xlsx");
      }
    },
    createNewFile() {
      this.$emit("create-new-file"); // ✅ App.vue로 이벤트 전송
    },
  },
  watch: {
    tableData: {
      immediate: true,
      deep: true,
      handler(newVal) {
        console.log("👀 tableData 변경 감지:", newVal); // ✅ 로그 추가
        this.localTableData = JSON.parse(JSON.stringify(newVal)); // 깊은 복사
      },
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
