<template>
  <div class="file-view">
    <h1>File Management</h1>
    <div class="file-actions">
      <button @click="loadFile">Load File</button>
      <button @click="saveFile">Save File</button>
      <button @click="createNewFile">New File</button>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      fileContent: "", // 파일 내용을 저장하는 변수
    };
  },
  methods: {
    loadFile() {
      // 파일 불러오기 (파일 선택 대화 상자 표시)
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".txt,.json,.csv";
      input.onchange = (event) => {
        const file = event.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            this.fileContent = reader.result;
          };
          reader.readAsText(file);
        }
      };
      input.click();
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
.file-container {
  padding: 20px;
}
button {
  padding: 10px 15px;
  font-size: 16px;
  cursor: pointer;
}
</style>
<style scoped>
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
.file-content {
  width: 100%;
  height: 300px;
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 10px;
  font-size: 16px;
  font-family: monospace;
}
</style>
