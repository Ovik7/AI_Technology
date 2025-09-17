const DATA_SOURCE = 'reviews_test.tsv';
const MODEL_ENDPOINT = 'https://api-inference.huggingface.co/models/siebert/sentiment-roberta-large-english';

const tokenInput = document.getElementById('token-input');
const analyzeBtn = document.getElementById('analyze-btn');
const reviewTextEl = document.getElementById('review-text');
const sentimentDisplayEl = document.getElementById('sentiment-display');
const sentimentIconEl = document.getElementById('sentiment-icon');
const sentimentLabelEl = document.getElementById('sentiment-label');
const statusMessageEl = document.getElementById('status-message');
const errorMessageEl = document.getElementById('error-message');

let reviews = [];
let isFetching = false;

function setStatus(message) {
    statusMessageEl.textContent = message ?? '';
}

function setError(message) {
    errorMessageEl.textContent = message ?? '';
}

function resetSentiment() {
    sentimentDisplayEl.hidden = true;
    sentimentIconEl.className = 'sentiment-icon';
    sentimentIconEl.innerHTML = '';
    sentimentLabelEl.textContent = '';
}

async function loadReviews() {
    if (isFetching || reviews.length) {
        return;
    }

    isFetching = true;
    setStatus('Fetching reviews dataset…');
    setError('');
    resetSentiment();

    try {
        const response = await fetch(DATA_SOURCE, { cache: 'no-cache' });
        if (!response.ok) {
            throw new Error(`Failed to load dataset (${response.status} ${response.statusText})`);
        }
        const rawText = await response.text();

        Papa.parse(rawText, {
            header: true,
            delimiter: '\t',
            skipEmptyLines: true,
            complete: (result) => {
                if (result.errors && result.errors.length) {
                    console.error('Papa Parse errors:', result.errors);
                    setError('Unable to read the TSV file. Please try again later.');
                    setStatus('');
                    return;
                }

                reviews = result.data
                    .map((row) => (row && typeof row.text === 'string' ? row.text.trim() : ''))
                    .filter((text) => text.length > 0);

                if (!reviews.length) {
                    setError('No reviews were found in the TSV file.');
                    setStatus('');
                    reviewTextEl.textContent = 'Dataset is empty. Add reviews to continue.';
                    analyzeBtn.disabled = true;
                    return;
                }

                reviewTextEl.textContent = 'Click the button to explore a random review.';
                analyzeBtn.disabled = false;
                setStatus(`${reviews.length} reviews loaded. Ready when you are!`);
            },
            error: (parseError) => {
                console.error('Papa Parse encountered an error:', parseError);
                setError('Unable to process the TSV file.');
                setStatus('');
            },
        });
    } catch (error) {
        console.error('Dataset fetch failed:', error);
        setError('Failed to download the dataset. Check your connection and refresh.');
        setStatus('');
        reviewTextEl.textContent = 'Unable to load reviews.';
        analyzeBtn.disabled = true;
    } finally {
        isFetching = false;
    }
}

function pickRandomReview() {
    if (!reviews.length) {
        return null;
    }
    const randomIndex = Math.floor(Math.random() * reviews.length);
    return reviews[randomIndex];
}

function renderSentiment(classification) {
    resetSentiment();
    if (!classification) {
        return;
    }

    const { label, iconClass, text } = classification;
    sentimentIconEl.classList.add(label);
    const iconElement = document.createElement('i');
    iconElement.classList.add('fa-solid', iconClass);
    sentimentIconEl.appendChild(iconElement);
    sentimentLabelEl.textContent = text;
    sentimentDisplayEl.hidden = false;
}

function interpretPrediction(predictions) {
    if (!Array.isArray(predictions) || !predictions.length) {
        return null;
    }

    let entries = predictions;
    if (Array.isArray(predictions[0])) {
        entries = predictions[0];
    }

    entries = entries.filter((entry) => entry && typeof entry.score === 'number' && typeof entry.label === 'string');
    if (!entries.length) {
        return null;
    }

    const topEntry = entries.reduce((best, current) => (current.score > best.score ? current : best));
    const normalizedLabel = topEntry.label.toUpperCase();

    if (normalizedLabel.includes('POSITIVE') && topEntry.score > 0.5) {
        return { label: 'positive', iconClass: 'fa-thumbs-up', text: `Positive (${(topEntry.score * 100).toFixed(1)}% confidence)` };
    }
    if (normalizedLabel.includes('NEGATIVE') && topEntry.score > 0.5) {
        return { label: 'negative', iconClass: 'fa-thumbs-down', text: `Negative (${(topEntry.score * 100).toFixed(1)}% confidence)` };
    }

    return { label: 'neutral', iconClass: 'fa-question', text: 'Neutral or uncertain sentiment' };
}

async function analyzeReview(review) {
    const token = tokenInput.value.trim();
    const headers = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    setStatus('Analyzing sentiment…');
    setError('');
    resetSentiment();
    analyzeBtn.disabled = true;

    try {
        const response = await fetch(MODEL_ENDPOINT, {
            method: 'POST',
            headers,
            body: JSON.stringify({ inputs: review }),
        });

        if (!response.ok) {
            let errorDetails = '';
            try {
                const problem = await response.json();
                errorDetails = problem.error || problem.message || '';
            } catch (parseErr) {
                errorDetails = response.statusText;
            }
            throw new Error(errorDetails || `API request failed with status ${response.status}`);
        }

        const data = await response.json();
        const sentiment = interpretPrediction(data);
        if (!sentiment) {
            setError('Received an unexpected response from the model.');
            setStatus('');
            return;
        }

        renderSentiment(sentiment);
        setStatus('Analysis complete.');
    } catch (error) {
        console.error('Sentiment analysis failed:', error);
        if (error.message && error.message.toLowerCase().includes('rate')) {
            setError('Rate limit reached. Try again in a moment or provide an API token.');
        } else if (error.message && error.message.toLowerCase().includes('authorization')) {
            setError('Authorization failed. Check your token.');
        } else if (error.message) {
            setError(error.message);
        } else {
            setError('Something went wrong while contacting Hugging Face.');
        }
        setStatus('');
    } finally {
        analyzeBtn.disabled = false;
    }
}

analyzeBtn.addEventListener('click', () => {
    setError('');
    const review = pickRandomReview();
    if (!review) {
        setError('No reviews available to analyze.');
        return;
    }
    reviewTextEl.textContent = review;
    analyzeReview(review);
});

window.addEventListener('DOMContentLoaded', () => {
    loadReviews();
});
