# Image OCR Entity Extractor

## Overview
The **Image OCR Entity Extractor** is a web application designed to upload handwritten notes or documents and extract entities using Optical Character Recognition (OCR). This tool leverages advanced AI models to process images and return structured data, making it easier to analyze and utilize extracted information.

## Features
- **Image Upload**: Users can drag and drop images or click to select files for upload. Supported formats include JPEG, PNG, GIF, and WEBP.
- **Entity Extraction**: The application extracts various entities from the uploaded images, including names, organizations, locations, dates, and more.
- **Text Extraction**: Maintains the formatting of the extracted text for better readability.
- **Downloadable Results**: Users can download the extracted entities in CSV format for further analysis.
- **User-Friendly Interface**: Built with Bootstrap for a responsive and intuitive user experience.

## Usage Instructions
1. **Upload an Image**: Drag and drop an image into the designated area or click to select a file.
2. **Process the Image**: After uploading, click the "Process Image" button to start the OCR and entity extraction process.
3. **View Results**: The extracted text and entities will be displayed in the results section. If no entities are detected, a message will be shown.
4. **Download Results**: Click the "Download CSV" button to save the extracted entities in a CSV file.

## Technical Details
- **Frontend**: The application is built using HTML, CSS (Bootstrap), and JavaScript.
- **OCR and Entity Extraction**: Utilizes an API for processing images and extracting text and entities.
- **Error Handling**: The application provides user feedback for errors during the upload and processing stages.

## Getting Started
To run the application locally:
1. Clone the repository.
2. Open `index.html` in a web browser.
3. Ensure you have internet access to fetch the necessary resources and API.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
