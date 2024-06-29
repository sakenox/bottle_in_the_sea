document.addEventListener('DOMContentLoaded', () => {
  const contentTextarea = document.getElementById('content');
  const charCount = document.querySelector('.char-count');
  const createNoteForm = document.getElementById('create-note-form');
  const responseMessage = document.getElementById('response-message');

  contentTextarea.addEventListener('input', () => {
    const length = contentTextarea.value.length;
    charCount.textContent = `${length} of 1,000 characters`;
  });

  createNoteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = contentTextarea.value.trim();

    if (content.length < 5 || content.length > 1000) {
      showMessage('Content must be between 5 and 1,000 characters.', 'error');
      return;
    }

    try {
      const response = await fetch('/create-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (response.ok) {
        showMessage('Message created successfully!', 'success');
      } else {
        const errorText = await response.text();
        showMessage(`Error: ${errorText}`, 'error');
      }
    } catch (error) {
      console.error('Error creating note:', error);
      showMessage('An error occurred while creating the note.', 'error');
    }
  });

  document.getElementById('back-button').addEventListener('click', () => {
    window.history.back();
  });

  function showMessage(message, type) {
    responseMessage.textContent = message;
    responseMessage.className = `response-message ${type}`;
    responseMessage.style.display = 'block';

    setTimeout(() => {
      responseMessage.style.display = 'none';
    }, 5000);
  }
});
