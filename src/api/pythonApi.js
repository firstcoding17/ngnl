import axios from "axios";

const API_BASE_URL = "http://localhost:5000/api";

export const runPythonScript = async (scriptName, args = []) => {
  try {
    const { data } = await http.post('/api/run-python', { scriptName, args });
    return data.output;
  } catch (error) {
    console.error("Error executing Python script:", error);
    throw error;
  }
};
