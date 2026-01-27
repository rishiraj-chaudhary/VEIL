import mongoose from 'mongoose';

const knowledgeItemSchema = new mongoose.Schema({
  itemId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  text: {
    type: String,
    required: true,
  },
  embedding: {
    type: [Number],
    required: true,
  },
  category: {
    type: String,
    required: true,
    index: true,
  },
  type: {
    type: String,
    required: true,
  },
}, {
  timestamps: true,
});

// Index for fast retrieval
knowledgeItemSchema.index({ category: 1, type: 1 });

const KnowledgeItem = mongoose.model('KnowledgeItem', knowledgeItemSchema);
export default KnowledgeItem;
