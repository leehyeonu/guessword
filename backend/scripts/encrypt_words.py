import os
from cryptography.fernet import Fernet

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base_dir, 'app', 'data')
    input_file = os.path.join(data_dir, 'words.txt')
    output_file = os.path.join(data_dir, 'words.enc')

    if not os.path.exists(input_file):
        print(f"Error: {input_file} 가 존재하지 않습니다.")
        return

    # 새로운 암호화 키 생성
    key = Fernet.generate_key()
    fernet = Fernet(key)

    # 원본 파일 읽기
    with open(input_file, 'rb') as f:
        original_data = f.read()

    # 데이터 암호화
    encrypted_data = fernet.encrypt(original_data)

    # 암호화된 데이터 저장
    with open(output_file, 'wb') as f:
        f.write(encrypted_data)

    print("✅ 암호화 성공! words.enc 파일이 생성되었습니다.")
    print("⚠️ 아래의 암호화 키(Key)를 반드시 안전한 곳에 백업하고, Hugging Face Secret (WORDS_DECRYPTION_KEY)으로 등록하세요.")
    print("-" * 50)
    print(key.decode('utf-8'))
    print("-" * 50)
    print("이제 words.txt 파일을 삭제해도 무방합니다. (깃허브/HuggingFace에는 절대 올리지 마세요)")

if __name__ == "__main__":
    main()
