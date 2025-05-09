git pull

git add .
git commit -m "shift"
git push

git checkout main
git pull origin main
git checkout feature/my-work
git merge main

git add .
git commit -m "setting"
git push origin feature/my-work
