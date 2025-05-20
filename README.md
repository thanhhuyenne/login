git pull

git add .
git commit -m "real-device"
git push

git checkout main
git pull origin main
git checkout feature/my-work
git merge main

git add .
git commit -m "Dashboards"
git push origin feature/my-work
