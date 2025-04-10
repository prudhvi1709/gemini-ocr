// DOM elements
const uploadArea = document.getElementById("upload-area");
const fileInput = document.getElementById("file-input");
const previewContainer = document.getElementById("preview-container");
const imagePreview = document.getElementById("image-preview");
const processBtn = document.getElementById("process-btn");
const clearBtn = document.getElementById("clear-btn");
const loadingContainer = document.getElementById("loading-container");
const errorContainer = document.getElementById("error-container");
const errorMessage = document.getElementById("error-message");
const resultsCard = document.getElementById("results-card");
const entityTable = document.getElementById("entity-table");
const entityTbody = document.getElementById("entity-tbody");
const downloadCsvBtn = document.getElementById("download-csv");
const noEntities = document.getElementById("no-entities");
const extractedTextContainer = document.createElement("div");
extractedTextContainer.className = "mb-4";
extractedTextContainer.id = "extracted-text-container";

// Current file in memory
let currentFile = null;
let extractedEntities = [];

// Event listeners for file upload
uploadArea.addEventListener("click", () => fileInput.click());
uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragging");
});
uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("dragging");
});
uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragging");

  if (e.dataTransfer.files.length) {
    handleFileUpload(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener("change", (e) => {
  if (e.target.files.length) {
    handleFileUpload(e.target.files[0]);
  }
});

processBtn.addEventListener("click", processImage);
clearBtn.addEventListener("click", clearImage);
downloadCsvBtn.addEventListener("click", downloadCsv);

function handleFileUpload(file) {
  // Validate file type
  const validTypes = ["image/jpeg", "image/png", "image/gif"];
  if (!validTypes.includes(file.type)) {
    showError("Please upload a valid image file (JPEG, PNG, or GIF).");
    return;
  }

  currentFile = file;

  // Preview image
  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.src = e.target.result;
    previewContainer.classList.remove("d-none");
    errorContainer.classList.add("d-none");
  };
  reader.readAsDataURL(file);
}

async function checkAuthentication() {
  try {
    const response = await fetch("https://llmfoundry.straive.com/token", {
      credentials: "include",
    });
    
    if (!response.ok) {
      return false;
    }
    
    const { token } = await response.json();
    return !!token;
  } catch (error) {
    console.error("Authentication check failed:", error);
    return false;
  }
}

function showLoginButton() {
  const loginUrl = `https://llmfoundry.straive.com/login?${new URLSearchParams({ next: location.href })}`;
  
  errorContainer.classList.remove("d-none");
  errorMessage.innerHTML = `
    Authentication required. Please log in to LLMFoundry to use this feature.
    <div class="mt-3">
      <a href="${loginUrl}" class="btn btn-primary">
        <i class="bi bi-box-arrow-in-right me-2"></i>Log in to LLMFoundry
      </a>
    </div>
  `;
}

async function processImage() {
  if (!currentFile) {
    showError("Please upload an image first.");
    return;
  }

  try {
    // Show loading state
    loadingContainer.classList.remove("d-none");
    processBtn.disabled = true;
    clearBtn.disabled = true;
    errorContainer.classList.add("d-none");
    resultsCard.classList.add("d-none");

    // Check authentication
    const isAuthenticated = await checkAuthentication();
    
    if (!isAuthenticated) {
      showLoginButton();
      return;
    }
    
    // Get token (we know it exists now)
    const { token } = await fetch("https://llmfoundry.straive.com/token", {
      credentials: "include",
    }).then(res => res.json());

    // Convert image to base64
    const base64Image = await fileToBase64(currentFile);
    const mimeType = currentFile.type;

    // First request - Get full OCR text
    const textResponse = await fetch(
      "https://llmfoundry.straive.com/gemini/v1beta/models/gemini-2.0-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: "Extract all text from this image. Maintain proper formatting and paragraph structure.",
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image.split(",")[1],
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!textResponse.ok) {
      throw new Error(`OCR text extraction failed with status: ${textResponse.status}`);
    }

    const textData = await textResponse.json();
    const extractedText = textData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Second request - Extract entities
    const response = await fetch(
      "https://llmfoundry.straive.com/gemini/v1beta/models/gemini-2.0-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: "Extract all entities from this image. Return in JSON format with the following fields: entityName, entityType, confidenceScore. EntityType should be one of: PERSON, ORGANIZATION, LOCATION, DATE, PHONE, EMAIL, ADDRESS, ID_NUMBER, AMOUNT, OTHER. For each entity, provide a confidence score from 0 to 1.",
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image.split(",")[1],
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`API request failed with status: ${response.status}`);
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error("No content returned from the API");
    }

    // Extract JSON from API response
    let jsonContent;
    try {
      // First try to parse the entire response as JSON
      jsonContent = JSON.parse(content);
    } catch (e) {
      // If that fails, try to extract JSON from the text
      const jsonMatch =
        content.match(/```json([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[0].replace(/```json|```/g, "").trim();
        jsonContent = JSON.parse(jsonStr);
      } else {
        throw new Error("Could not parse JSON from API response");
      }
    }

    // Process entities from response
    if (Array.isArray(jsonContent)) {
      extractedEntities = jsonContent;
    } else if (jsonContent.entities && Array.isArray(jsonContent.entities)) {
      extractedEntities = jsonContent.entities;
    } else {
      extractedEntities = [];
    }

    // Display OCR text and entities
    displayOcrText(extractedText);
    displayEntities(extractedEntities);
  } catch (error) {
    console.error("Error:", error);
    showError(`Error processing image: ${error.message}`);
  } finally {
    loadingContainer.classList.add("d-none");
    processBtn.disabled = false;
    clearBtn.disabled = false;
  }
}

function displayEntities(entities) {
  // Clear previous results
  entityTbody.innerHTML = "";

  // Show text container first
  extractedTextContainer.classList.remove("d-none");
  
  if (entities.length === 0) {
    noEntities.classList.remove("d-none");
    entityTable.classList.add("d-none");
  } else {
    noEntities.classList.add("d-none");
    entityTable.classList.remove("d-none");

    // Populate table
    entities.forEach((entity, index) => {
      const row = document.createElement("tr");

      const confidenceScore =
        entity.confidenceScore || entity.confidence || "N/A";
      const formattedConfidence =
        typeof confidenceScore === "number"
          ? (confidenceScore * 100).toFixed(1) + "%"
          : confidenceScore;

      row.innerHTML = `
              <td>${index + 1}</td>
              <td>${entity.entityName || entity.name || "Unknown"}</td>
              <td><span class="badge bg-secondary">${
                entity.entityType || entity.type || "Unknown"
              }</span></td>
              <td>${formattedConfidence}</td>
            `;

      entityTbody.appendChild(row);
    });
  }

  // Show results card
  resultsCard.classList.remove("d-none");
}

function clearImage() {
  currentFile = null;
  imagePreview.src = "";
  previewContainer.classList.add("d-none");
  errorContainer.classList.add("d-none");
  resultsCard.classList.add("d-none");
  extractedEntities = [];
  fileInput.value = "";
  
  // Also clear extracted text
  if (document.getElementById("extracted-text-container")) {
    extractedTextContainer.innerHTML = '';
    extractedTextContainer.classList.add("d-none");
  }
}

function showError(message) {
  errorMessage.textContent = message;
  errorContainer.classList.remove("d-none");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadCsv() {
  if (extractedEntities.length === 0) {
    showError("No data to download");
    return;
  }

  // Create CSV content
  let csvContent = "data:text/csv;charset=utf-8,";

  // Add header row
  csvContent += "Entity Name,Entity Type,Confidence\n";

  // Add data rows
  extractedEntities.forEach((entity) => {
    const name = entity.entityName || entity.name || "Unknown";
    const type = entity.entityType || entity.type || "Unknown";
    const confidence = entity.confidenceScore || entity.confidence || "N/A";

    // Escape commas and quotes in the name
    const escapedName = `"${name.replace(/"/g, '""')}"`;

    csvContent += `${escapedName},${type},${confidence}\n`;
  });

  // Create download link
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "extracted_entities.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Add new function to display OCR text
function displayOcrText(text) {
  // Create card for extracted text
  const textCard = document.createElement("div");
  textCard.className = "col-12";
  textCard.innerHTML = `
    <div class="card shadow-sm mb-4">
      <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
        <h4 class="mb-0"><i class="bi bi-file-text me-2"></i>Extracted Text</h4>
        <button id="copy-text-btn" class="btn btn-light btn-sm">
          <i class="bi bi-clipboard me-2"></i>Copy Text
        </button>
      </div>
      <div class="card-body">
        <div class="extracted-text-content" style="white-space: pre-wrap;">${text || 'No text was extracted from the image.'}</div>
      </div>
    </div>
  `;
  
  // Clear previous content
  extractedTextContainer.innerHTML = '';
  extractedTextContainer.appendChild(textCard);
  
  // Add the text container before the results card if it's not already there
  if (!document.getElementById("extracted-text-container")) {
    resultsCard.parentNode.insertBefore(extractedTextContainer, resultsCard);
  }
  
  // Add copy functionality
  const copyButton = textCard.querySelector("#copy-text-btn");
  copyButton.addEventListener("click", () => {
    navigator.clipboard.writeText(text)
      .then(() => {
        // Show copied feedback
        const originalText = copyButton.innerHTML;
        copyButton.innerHTML = '<i class="bi bi-check-lg me-2"></i>Copied!';
        setTimeout(() => {
          copyButton.innerHTML = originalText;
        }, 2000);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
      });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  // Check authentication status on page load
  const isAuthenticated = await checkAuthentication();
  
  if (!isAuthenticated) {
    // Add a subtle notification that login is required
    const authNotice = document.createElement("div");
    authNotice.className = "alert alert-info mt-3";
    authNotice.innerHTML = `
      <i class="bi bi-info-circle-fill me-2"></i>
      You'll need to <a href="https://llmfoundry.straive.com/login?${new URLSearchParams({ next: location.href })}" class="alert-link">log in to LLMFoundry</a> to process images.
    `;
    
    uploadArea.parentNode.insertBefore(authNotice, uploadArea.nextSibling);
  }
});
