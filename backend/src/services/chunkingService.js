import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

class ChunkingService {
  constructor() {
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ["\n\n", "\n", ". ", " ", ""],
    });

    console.log('✅ LangChain RecursiveCharacterTextSplitter initialized');
  }

  async chunk(text) {
    try {
      const chunks = await this.splitter.splitText(text);
      console.log(`📝 Chunked into ${chunks.length} pieces (1000 chars, 200 overlap)`);
      return chunks;
    } catch (error) {
      console.error('❌ Chunking failed:', error.message);
      return [text];
    }
  }

  async createDocuments(texts, metadatas = []) {
    try {
      const documents = await this.splitter.createDocuments(texts, metadatas);
      console.log(`📄 Created ${documents.length} Document objects`);
      return documents;
    } catch (error) {
      console.error('❌ Document creation failed:', error.message);
      return [];
    }
  }

  async splitDocuments(documents) {
    try {
      const splitDocs = await this.splitter.splitDocuments(documents);
      console.log(`📄 Split ${documents.length} documents into ${splitDocs.length} chunks`);
      return splitDocs;
    } catch (error) {
      console.error('❌ Document splitting failed:', error.message);
      return documents;
    }
  }
}

export default new ChunkingService();