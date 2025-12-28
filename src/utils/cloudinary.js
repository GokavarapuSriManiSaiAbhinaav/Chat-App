const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

/**
 * Uploads a file to Cloudinary.
 * @param {File | Blob} file - The file or blob to upload.
 * @param {string} resourceType - 'image', 'video' (for audio too), or 'auto'.
 * @returns {Promise<string>} - The secure URL of the uploaded asset.
 */
export const uploadToCloudinary = async (file, resourceType = 'auto') => {
    if (!cloudName || !uploadPreset) {
        throw new Error("Cloudinary configuration missing. Check .env variables.");
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    // formData.append('resource_type', resourceType); // Not needed in body usually for unsigned, but endpoint matters

    // URL should determine resource type
    // API: https://api.cloudinary.com/v1_1/<cloud_name>/<resource_type>/upload
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

    try {
        const response = await fetch(url, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error.message || "Upload failed");
        }

        const data = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error("Cloudinary upload error:", error);
        throw error;
    }
};
